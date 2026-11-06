import { createClient } from '@supabase/supabase-js';
import { authorizationServer, MCP_RESOURCE } from './config';
import type { WorkspaceRepository, Snapshot } from './tools';

export class AuthenticationError extends Error {}
export function checkPluginClaims(claims:Record<string,unknown>,issuer:string,now=Date.now()/1000) {
 const audience=claims.aud;
 if(claims.iss!==issuer || !(audience==='authenticated' || Array.isArray(audience)&&audience.includes('authenticated')) || typeof claims.exp!=='number' || claims.exp<=now || typeof claims.sub!=='string' || claims.role!=='authenticated' || typeof claims.client_id!=='string' || claims.resource!==MCP_RESOURCE || typeof claims.mandaloom_grant!=='string' || !Array.isArray(claims.mandaloom_permissions) || !claims.mandaloom_permissions.includes('read') || (typeof claims.nbf==='number' && claims.nbf>now)) throw new AuthenticationError('Sign in and authorize this Mandaloom connection.');
 return {ownerId:claims.sub,permissions:claims.mandaloom_permissions.filter((v):v is string=>v==='read'||v==='write')};
}
export async function authenticatedRepository(authorization:string|null):Promise<WorkspaceRepository> {
 if(!authorization?.startsWith('Bearer ') || authorization.length>20000)throw new AuthenticationError('Sign in to Mandaloom.');
 const token=authorization.slice(7);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(), key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
 if(!url||!key)throw Error('Supabase is not configured.');
 const client=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 // getClaims verifies signature using Supabase JWKS (or Auth for legacy signing keys).
 const {data,error}=await client.auth.getClaims(token);
 if(error||!data)throw new AuthenticationError('Your connection expired. Reconnect Mandaloom.');
 const connection=checkPluginClaims(data.claims,authorizationServer());
 const rpc=async(name:string,args?:Record<string,unknown>)=>{
  const {data,error}=await client.rpc(name,args);
  if(error){
   if(/authorization required|revoked|browser owner|Read-only|access denied/i.test(error.message))throw new AuthenticationError('This connection is not authorized for the requested action. Reconnect or review its permissions.');
   if(error.code==='PGRST202')throw Error('Plugin database setup is incomplete. Apply 003_private_plugin.sql in Supabase.');
   throw Error(error.message);
  }
  return data;
 };
 return {connection,load:async()=>{const snapshot=await rpc('mandaloom_plugin_load') as Snapshot;if(snapshot.planningVersion!==1)throw Error('Planning setup is incomplete. Apply 005_objective_planning.sql in Supabase.');if(snapshot.referenceVersion!==1)throw Error('Grid reference setup is incomplete. Apply 004_grid_references.sql in Supabase.');return snapshot;},receipt:(requestId,fingerprint)=>rpc('mandaloom_plugin_receipt',{operation_id:requestId,operation_fingerprint:fingerprint}),commit:(revision,nodes,requestId,fingerprint,result)=>rpc('mandaloom_plugin_commit',{expected_revision:revision,payload:nodes,operation_id:requestId,operation_fingerprint:fingerprint,operation_result:result})};
}
