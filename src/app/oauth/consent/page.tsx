import PluginConsent from '@/components/plugin-consent';
export default async function ConsentPage({searchParams}:{searchParams:Promise<{authorization_id?:string}>}){const params=await searchParams;return <PluginConsent authorizationId={params.authorization_id??''}/>;}
