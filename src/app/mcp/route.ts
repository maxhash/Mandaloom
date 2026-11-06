import { handleMcpRequest } from '@/lib/mcp/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
export const GET=(request:Request)=>handleMcpRequest(request);
export const POST=(request:Request)=>handleMcpRequest(request);
export const DELETE=(request:Request)=>handleMcpRequest(request);
export const OPTIONS=(request:Request)=>handleMcpRequest(request);
