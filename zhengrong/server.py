# Fix Pillow _webp.HAVE_WEBPANIM AttributeError (must run before PIL imports)
try:
    import PIL._webp
    if not hasattr(PIL._webp, 'HAVE_WEBPANIM'):
        PIL._webp.HAVE_WEBPANIM = False
except (ImportError, AttributeError):
    pass

import os
import io
import uuid
import base64
import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor

os.environ['OPENCV_IO_ENABLE_OPENEXR'] = '1'
os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'expandable_segments:True'

import cv2
import torch
import numpy as np
from PIL import Image
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import uvicorn

from trellis2.modules.sparse import SparseTensor
from trellis2.pipelines import Trellis2ImageTo3DPipeline
from trellis2.renderers import EnvMap
from trellis2.utils import render_utils
import o_voxel

# ── Constants ────────────────────────────────────────────────────────────────
STEPS = 8
PREVIEW_MODE = 'shaded_forest'
PREVIEW_RESOLUTION = 512

# ── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title='Zhengrong 3D API')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

# ── Global singletons ────────────────────────────────────────────────────────
pipeline: Trellis2ImageTo3DPipeline = None
envmap: dict = None

# Single-thread executor so only one GPU job runs at a time
gpu_executor = ThreadPoolExecutor(max_workers=1)

# job_id -> { status: 'pending'|'running'|'done'|'error', images, packed_state, error }
jobs: dict = {}
# session_id -> packed latent state (for /extract_glb)
sessions: dict = {}
# glb_job_id -> { status: 'pending'|'running'|'done'|'error', bytes, error }
glb_jobs: dict = {}


# ── Helpers ──────────────────────────────────────────────────────────────────

def image_to_base64(image: Image.Image) -> str:
    buf = io.BytesIO()
    image.convert('RGB').save(buf, format='jpeg', quality=85)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


def pack_state(latents):
    shape_slat, tex_slat, res = latents
    return {
        'shape_slat_feats': shape_slat.feats.cpu().numpy(),
        'tex_slat_feats':   tex_slat.feats.cpu().numpy(),
        'coords':           shape_slat.coords.cpu().numpy(),
        'res':              res,
    }


def unpack_state(state: dict):
    shape_slat = SparseTensor(
        feats=torch.from_numpy(state['shape_slat_feats']).cuda(),
        coords=torch.from_numpy(state['coords']).cuda(),
    )
    tex_slat = shape_slat.replace(torch.from_numpy(state['tex_slat_feats']).cuda())
    return shape_slat, tex_slat, state['res']


# ── GPU work (runs in gpu_executor thread) ───────────────────────────────────

def _generate_job(job_id: str, image: Image.Image, params: dict):
    jobs[job_id]['status'] = 'running'
    try:
        resolution = params.get('resolution', '1024')
        pipeline_type = {'512': '512', '1024': '1024_cascade', '1536': '1536_cascade'}[resolution]

        outputs, latents = pipeline.run(
            image,
            seed=params.get('seed', 0),
            preprocess_image=False,
            sparse_structure_sampler_params={
                'steps':             params.get('ss_sampling_steps', 12),
                'guidance_strength': params.get('ss_guidance_strength', 7.5),
                'guidance_rescale':  params.get('ss_guidance_rescale', 0.7),
                'rescale_t':         params.get('ss_rescale_t', 5.0),
            },
            shape_slat_sampler_params={
                'steps':             params.get('shape_slat_sampling_steps', 12),
                'guidance_strength': params.get('shape_slat_guidance_strength', 7.5),
                'guidance_rescale':  params.get('shape_slat_guidance_rescale', 0.5),
                'rescale_t':         params.get('shape_slat_rescale_t', 3.0),
            },
            tex_slat_sampler_params={
                'steps':             params.get('tex_slat_sampling_steps', 12),
                'guidance_strength': params.get('tex_slat_guidance_strength', 1.0),
                'guidance_rescale':  params.get('tex_slat_guidance_rescale', 0.0),
                'rescale_t':         params.get('tex_slat_rescale_t', 3.0),
            },
            pipeline_type=pipeline_type,
            return_latent=True,
        )

        mesh = outputs[0]
        mesh.simplify(16777216)

        rendered = render_utils.render_snapshot(
            mesh, resolution=PREVIEW_RESOLUTION, r=2, fov=36, nviews=STEPS, envmap=envmap,
        )
        packed = pack_state(latents)
        torch.cuda.empty_cache()

        images_b64 = [
            image_to_base64(Image.fromarray(rendered[PREVIEW_MODE][i]))
            for i in range(STEPS)
        ]

        session_id = str(uuid.uuid4())
        sessions[session_id] = packed

        jobs[job_id]['status'] = 'done'
        jobs[job_id]['images'] = images_b64
        jobs[job_id]['state'] = {
            'session_id':        session_id,
            'decimation_target': params.get('decimation_target', 500000),
            'texture_size':      params.get('texture_size', 2048),
        }

    except Exception as e:
        jobs[job_id]['status'] = 'error'
        jobs[job_id]['error'] = str(e)


def _run_extract(packed: dict, decimation_target: int, texture_size: int) -> bytes:
    shape_slat, tex_slat, res = unpack_state(packed)
    mesh = pipeline.decode_latent(shape_slat, tex_slat, res)[0]
    glb = o_voxel.postprocess.to_glb(
        vertices=mesh.vertices,
        faces=mesh.faces,
        attr_volume=mesh.attrs,
        coords=mesh.coords,
        attr_layout=pipeline.pbr_attr_layout,
        grid_size=res,
        aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
        decimation_target=decimation_target,
        texture_size=texture_size,
        remesh=True,
        remesh_band=1,
        remesh_project=0,
        use_tqdm=True,
    )
    buf = io.BytesIO()
    glb.export(buf, extension_webp=False)
    torch.cuda.empty_cache()
    return buf.getvalue()


def _extract_job(glb_job_id: str, packed: dict, decimation_target: int, texture_size: int):
    glb_jobs[glb_job_id]['status'] = 'running'
    try:
        glb_bytes = _run_extract(packed, decimation_target, texture_size)
        glb_jobs[glb_job_id]['status'] = 'done'
        glb_jobs[glb_job_id]['bytes'] = glb_bytes
    except Exception as e:
        glb_jobs[glb_job_id]['status'] = 'error'
        glb_jobs[glb_job_id]['error'] = str(e)


# ── Routes ───────────────────────────────────────────────────────────────────

@app.post('/generate_3d')
async def generate_3d(
    file: UploadFile = File(...),
    resolution: str = Form('1024'),
    seed: int = Form(0),
    decimation_target: int = Form(500000),
    texture_size: int = Form(2048),
    ss_guidance_strength: float = Form(7.5),
    ss_guidance_rescale: float = Form(0.7),
    ss_sampling_steps: int = Form(12),
    ss_rescale_t: float = Form(5.0),
    shape_slat_guidance_strength: float = Form(7.5),
    shape_slat_guidance_rescale: float = Form(0.5),
    shape_slat_sampling_steps: int = Form(12),
    shape_slat_rescale_t: float = Form(3.0),
    tex_slat_guidance_strength: float = Form(1.0),
    tex_slat_guidance_rescale: float = Form(0.0),
    tex_slat_sampling_steps: int = Form(12),
    tex_slat_rescale_t: float = Form(3.0),
):
    raw = await file.read()
    image = Image.open(io.BytesIO(raw)).convert('RGBA')
    image = pipeline.preprocess_image(image)

    job_id = str(uuid.uuid4())
    jobs[job_id] = {'status': 'pending'}

    params = dict(
        resolution=resolution,
        seed=seed,
        decimation_target=decimation_target,
        texture_size=texture_size,
        ss_guidance_strength=ss_guidance_strength,
        ss_guidance_rescale=ss_guidance_rescale,
        ss_sampling_steps=ss_sampling_steps,
        ss_rescale_t=ss_rescale_t,
        shape_slat_guidance_strength=shape_slat_guidance_strength,
        shape_slat_guidance_rescale=shape_slat_guidance_rescale,
        shape_slat_sampling_steps=shape_slat_sampling_steps,
        shape_slat_rescale_t=shape_slat_rescale_t,
        tex_slat_guidance_strength=tex_slat_guidance_strength,
        tex_slat_guidance_rescale=tex_slat_guidance_rescale,
        tex_slat_sampling_steps=tex_slat_sampling_steps,
        tex_slat_rescale_t=tex_slat_rescale_t,
    )
    # Submit to single-GPU thread — returns immediately
    gpu_executor.submit(_generate_job, job_id, image, params)

    return {'job_id': job_id}


@app.post('/job_status')
async def job_status(body: dict):
    job_id = body.get('job_id')
    if not job_id or job_id not in jobs:
        raise HTTPException(status_code=404, detail='Job not found')

    job = jobs[job_id]
    status = job['status']

    if status == 'done':
        return {'status': 'done', 'images': job['images'], 'state': job['state']}
    elif status == 'error':
        return {'status': 'error', 'error': job.get('error', 'Unknown error')}
    else:
        return {'status': status}  # 'pending' or 'running'


@app.post('/extract_glb')
async def extract_glb(body: dict):
    session_id = body.get('session_id')
    if not session_id or session_id not in sessions:
        raise HTTPException(status_code=400, detail='Invalid or expired session_id. Generate first.')

    packed = sessions[session_id]
    decimation_target = int(body.get('decimation_target', 500000))
    texture_size      = int(body.get('texture_size', 2048))

    glb_job_id = str(uuid.uuid4())
    glb_jobs[glb_job_id] = {'status': 'pending'}
    gpu_executor.submit(_extract_job, glb_job_id, packed, decimation_target, texture_size)

    return {'glb_job_id': glb_job_id}


@app.post('/glb_status')
async def glb_status(body: dict):
    glb_job_id = body.get('glb_job_id')
    if not glb_job_id or glb_job_id not in glb_jobs:
        raise HTTPException(status_code=404, detail='GLB job not found')

    job = glb_jobs[glb_job_id]
    status = job['status']

    if status == 'error':
        return {'status': 'error', 'error': job.get('error', 'Unknown error')}
    return {'status': status}  # 'pending', 'running', or 'done'


@app.get('/download_glb/{glb_job_id}')
async def download_glb(glb_job_id: str):
    if glb_job_id not in glb_jobs:
        raise HTTPException(status_code=404, detail='GLB job not found')

    job = glb_jobs[glb_job_id]
    if job['status'] != 'done':
        raise HTTPException(status_code=409, detail='GLB not ready yet')

    glb_bytes = job['bytes']
    return Response(
        content=glb_bytes,
        media_type='model/gltf-binary',
        headers={'Content-Disposition': 'attachment; filename="model.glb"'},
    )


@app.get('/health')
def health():
    running = sum(1 for j in jobs.values() if j['status'] == 'running')
    pending = sum(1 for j in jobs.values() if j['status'] == 'pending')
    glb_running = sum(1 for j in glb_jobs.values() if j['status'] == 'running')
    return {'status': 'ok', 'jobs_running': running, 'jobs_pending': pending, 'sessions': len(sessions), 'glb_jobs_running': glb_running}


# ── Startup ──────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    print('Loading TRELLIS.2 pipeline…')
    pipeline = Trellis2ImageTo3DPipeline.from_pretrained('microsoft/TRELLIS.2-4B')
    pipeline.cuda()

    print('Loading environment maps…')
    def _load_envmap(path):
        img = cv2.cvtColor(cv2.imread(path, cv2.IMREAD_UNCHANGED), cv2.COLOR_BGR2RGB)
        return EnvMap(torch.tensor(img, dtype=torch.float32, device='cuda'))

    envmap = {
        'forest':    _load_envmap('assets/hdri/forest.exr'),
        'sunset':    _load_envmap('assets/hdri/sunset.exr'),
        'courtyard': _load_envmap('assets/hdri/courtyard.exr'),
    }

    port = int(os.environ.get('PORT', '24681'))
    host = os.environ.get('HOST', '0.0.0.0')
    print(f'Starting server on {host}:{port}')
    uvicorn.run(app, host=host, port=port)
