import handler from '../../node-functions/api/zhengrong/generate_3d.js';
import { runNodeFunction } from '../_lib/run-node-function.js';

const invoke = request => runNodeFunction(handler, request);

export const GET = invoke;
export const POST = invoke;
export const PUT = invoke;
export const PATCH = invoke;
export const DELETE = invoke;
export const HEAD = invoke;
export const OPTIONS = invoke;
