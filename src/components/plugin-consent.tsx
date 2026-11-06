'use client';
import {useEffect,useState} from 'react';
import {Flower2} from 'lucide-react';
import type {OAuthAuthorizationDetails} from '@supabase/supabase-js';
import {Button} from './ui/button';
import {supabase} from '@/lib/supabase';

export default function PluginConsent({authorizationId}:{authorizationId:string}) {
 const [signedIn,setSignedIn]=useState(false),[details,setDetails]=useState<OAuthAuthorizationDetails|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[allowWrite,setAllowWrite]=useState(true),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const load=async()=>{
  setBusy(true);setError('');
  try{
   if(!supabase)throw Error('Supabase is not configured.');
   if(!authorizationId)throw Error('Start the connection from your Mandaloom plugin in ChatGPT.');
   const {data,error}=await supabase.auth.getSession();if(error)throw error;
   if(!data.session){setSignedIn(false);return;}
   setSignedIn(true);
   const workspace=await supabase.rpc('load_workspace');if(workspace.error)throw workspace.error;
   const result=await supabase.auth.oauth.getAuthorizationDetails(authorizationId);if(result.error)throw result.error;
   if('authorization_id' in result.data)setDetails(result.data);else window.location.assign(result.data.redirect_url);
  }catch(e){setError(message(e));}finally{setBusy(false);}
 };
 useEffect(()=>{void load();},[authorizationId]); // Authorization requests stay in this tab until a decision.
 const signIn=async(e:React.FormEvent)=>{e.preventDefault();if(!supabase)return;setBusy(true);setError('');const {error}=await supabase.auth.signInWithPassword({email,password});setPassword('');if(error){setError(error.message);setBusy(false);}else await load();};
 const decide=async(approve:boolean)=>{
  if(!supabase||!details)return;setBusy(true);setError('');
  try{
   if(approve){const {error}=await supabase.rpc('mandaloom_grant_connection',{oauth_client_id:details.client.id,display_name:details.client.name||'Mandaloom connection',allow_write:allowWrite});if(error)throw error;}
   const result=approve?await supabase.auth.oauth.approveAuthorization(authorizationId,{skipBrowserRedirect:true}):await supabase.auth.oauth.denyAuthorization(authorizationId,{skipBrowserRedirect:true});
   if(result.error)throw result.error;window.location.assign(result.data.redirect_url);
  }catch(e){setError(message(e));setBusy(false);}
 };
 return <main className="login"><section className="login-card consent-card"><div className="brand"><Flower2/> Mandaloom</div><h1>Connect your workspace</h1>{error&&<p role="alert" className="error">{error}</p>}{!signedIn?<><p>Sign in to your private Mandaloom account to review this connection.</p><form onSubmit={signIn}><label>Email<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><Button disabled={busy}>Sign in</Button></form></>:details?<><p><strong>{details.client.name}</strong> is requesting access to your Mandaloom workspace.</p><small>Client ID: {details.client.id}<br/>Return address: {details.redirect_uri}<br/>Identity scopes: {details.scope||'None'}</small><p>This connection can read your Mandalas, descriptions and progress fields.</p><label className="checkbox"><input type="checkbox" checked={allowWrite} onChange={e=>setAllowWrite(e.target.checked)} disabled={busy}/> Also allow creating and editing objectives</label><p>{allowWrite?'Tools may fill empty cells and edit objective fields. No delete or move tools are provided.':'Read only. Creating or editing objectives will be blocked.'} You can revoke access at any time.</p><div className="connection-actions"><Button variant="outline" disabled={busy} onClick={()=>void decide(false)}>Deny</Button><Button disabled={busy} onClick={()=>void decide(true)}>{busy?'Connecting…':'Allow access'}</Button></div></>:<p>{busy?'Loading the connection request…':'Unable to load this connection. Start again from ChatGPT.'}</p>}<a href="/connections">Manage existing connections</a></section></main>;
}
function message(e:unknown){return e&&typeof e==='object'&&'message' in e?String(e.message):'Connection failed. Please try again.';}
