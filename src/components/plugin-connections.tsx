'use client';
import {useEffect,useState} from 'react';
import {Flower2} from 'lucide-react';
import {Button} from './ui/button';
import {supabase} from '@/lib/supabase';
type Connection={clientId:string;name:string;canWrite:boolean;createdAt:string};
export default function PluginConnections(){
 const [connections,setConnections]=useState<Connection[]>([]),[error,setError]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 const load=async()=>{try{if(!supabase)throw Error('Cloud connections require Supabase.');const {data,error}=await supabase.rpc('mandaloom_list_connections');if(error)throw error;setConnections(data);setReady(true);}catch(e){setError(message(e));}};
 useEffect(()=>{void load();},[]);
 const revoke=async(c:Connection)=>{if(!supabase||!confirm(`Revoke ${c.name} access to your workspace?`))return;setBusy(true);setError('');try{
  const {error}=await supabase.rpc('mandaloom_revoke_connection',{oauth_client_id:c.clientId});if(error)throw error;
  // Data access is revoked first even if the identity provider cannot be reached.
  const result=await supabase.auth.oauth.revokeGrant({clientId:c.clientId});if(result.error)setError('Workspace access was revoked. Remove the plugin connection in ChatGPT too before reconnecting.');
  await load();
 }catch(e){setError(message(e));}finally{setBusy(false);}};
 return <main className="login"><section className="login-card consent-card"><div className="brand"><Flower2/> Mandaloom</div><h1>Plugin connections</h1><p>Connect the private Mandaloom plugin to read and update your grids from ChatGPT. Your existing workspace stays private.</p><p className="connection-endpoint">MCP endpoint<br/><code>https://mandaloom.vercel.app/mcp</code></p>{error&&<p role="alert" className="error">{error}</p>}{!ready?<p>Sign in through <a href="/">your workspace</a> first. If you are already signed in, the plugin database setup may be incomplete.</p>:connections.length===0?<p>No authorized connections yet.</p>:<ul className="connections-list">{connections.map(c=><li key={c.clientId}><strong>{c.name}</strong><small>{c.canWrite?'Read and edit':'Read only'}</small><Button disabled={busy} variant="destructive" onClick={()=>void revoke(c)}>Revoke access</Button></li>)}</ul>}<p>After plugin edits, refresh your workspace to see the latest version. Pending browser edits are protected by save-conflict checks.</p><a href="/">Back to workspace</a></section></main>;
}
function message(e:unknown){return e&&typeof e==='object'&&'message' in e?String(e.message):'Unable to manage connections.';}
