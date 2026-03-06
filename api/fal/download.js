import handler from '../../node-functions/api/fal/download/[requestId].js';
import { runNodeFunction } from '../_lib/run-node-function.js';

const invoke = request => runNodeFunction(handler, request);

export const GET = invoke;
export const POST = invoke;
export const PUT = invoke;
export const PATCH = invoke;
export const DELETE = invoke;
export const HEAD = invoke;
export const OPTIONS = invoke;
