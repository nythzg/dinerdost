'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Icon} from '@/components/ui';
import {idempotentPost,request,type Row} from '@/lib/client';

async function gatherIce(peer:RTCPeerConnection){
 if(peer.iceGatheringState==='complete')return;
 await new Promise<void>((resolve,reject)=>{const finish=()=>{clearTimeout(timer);peer.removeEventListener('icegatheringstatechange',changed)},changed=()=>{if(peer.iceGatheringState==='complete'){finish();resolve()}},timer=setTimeout(()=>{finish();reject(new Error('Could not prepare the voice connection. Try again.'))},10000);peer.addEventListener('icegatheringstatechange',changed)});
}

export function SupportCall({threadId,platform,finished}:{threadId:string;platform:boolean;finished:boolean}){
 const endpoint=platform?'/api/superadmin/support-call':'/api/support/call';
 const [data,setData]=useState<Row|null>(null),[busy,setBusy]=useState(false),[phase,setPhase]=useState(''),[error,setError]=useState(''),[needsAudio,setNeedsAudio]=useState(false),[available,setAvailable]=useState(false),[muted,setMuted]=useState(false);
 const peer=useRef<RTCPeerConnection|null>(null),stream=useRef<MediaStream|null>(null),audio=useRef<HTMLAudioElement>(null),alive=useRef(true),settingAnswer=useRef(false),negotiating=useRef(false),sequence=useRef(0);
 const stop=useCallback(()=>{if(peer.current){peer.current.ontrack=null;peer.current.onconnectionstatechange=null;peer.current.close();peer.current=null}stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;if(audio.current)audio.current.srcObject=null},[]);
 const load=useCallback(async(signal?:AbortSignal)=>{const revision=++sequence.current;try{const value=await request(endpoint+'?id='+threadId,{signal});if(!alive.current||signal?.aborted||revision!==sequence.current)return;setData(value);const connection=peer.current;if(!value.call&&connection&&!negotiating.current){stop();setPhase('Call ended.')}else if(value.call?.state==='ANSWERED'&&value.call.caller_id===value.userId&&connection&&!connection.remoteDescription&&!settingAnswer.current){settingAnswer.current=true;try{await connection.setRemoteDescription({type:'answer',sdp:value.call.answer})}finally{settingAnswer.current=false}}}catch(issue){if(alive.current&&!signal?.aborted)setError((issue as Error).message)}},[endpoint,threadId,stop]);
 useEffect(()=>{alive.current=true;setAvailable(window.isSecureContext&&typeof navigator.mediaDevices?.getUserMedia==='function'&&typeof window.RTCPeerConnection==='function');const controller=new AbortController();void load(controller.signal);const timer=setInterval(()=>{if(!document.hidden||peer.current)void load(controller.signal)},2000);return()=>{alive.current=false;controller.abort();clearInterval(timer);stop()}},[load,stop]);
 useEffect(()=>{if(finished){stop();setPhase('Conversation finished.')}},[finished,stop]);
 async function prepare(){
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('Voice calls require HTTPS or localhost and microphone access.');
  const media=await navigator.mediaDevices.getUserMedia({audio:true,video:false});if(!alive.current){media.getTracks().forEach(track=>track.stop());throw new Error('The conversation was closed.')}stream.current=media;
  // shortcut: host ICE candidates support local-network calls; configure a TURN relay before offering cross-network reliability.
  const connection=new RTCPeerConnection({iceServers:[]});peer.current=connection;media.getTracks().forEach(track=>connection.addTrack(track,media));
  connection.ontrack=event=>{if(audio.current){audio.current.srcObject=event.streams[0]??new MediaStream([event.track]);void audio.current.play().catch(()=>setNeedsAudio(true))}};
  connection.onconnectionstatechange=()=>{if(!alive.current)return;const state=connection.connectionState;setPhase(state==='connected'?'Connected · voice call':state==='failed'?'Could not connect. End the call and try again on the same network.':state==='disconnected'?'Connection interrupted.':state==='closed'?'Call ended.':'Connecting…');if(state==='failed'){stream.current?.getTracks().forEach(track=>track.stop());stream.current=null}};
  return connection;
 }
 async function act(action:'start'|'answer'|'end',decline=false){
  setBusy(true);setError('');setMuted(false);negotiating.current=action!=='end';try{
   if(action==='end'){stop();setPhase('Ending call…');await idempotentPost(endpoint,{action:'end',threadId,callId:data!.call.id,version:data!.call.version,decline});stop();setPhase(decline?'Call declined.':'Call ended.');}
   else{setPhase(action==='start'?'Requesting microphone…':'Answering…');const connection=await prepare();if(action==='start'){await connection.setLocalDescription(await connection.createOffer());await gatherIce(connection);await idempotentPost(endpoint,{action:'start',threadId,offer:connection.localDescription!.sdp});setPhase('Calling… waiting for an answer.')}else{await connection.setRemoteDescription({type:'offer',sdp:data!.call.offer});await connection.setLocalDescription(await connection.createAnswer());await gatherIce(connection);await idempotentPost(endpoint,{action:'answer',threadId,callId:data!.call.id,version:data!.call.version,answer:connection.localDescription!.sdp});setPhase('Connecting…')}}
   await load();
  }catch(issue){stop();setPhase('Not connected.');setError((issue as Error).message)}finally{negotiating.current=false;if(alive.current)setBusy(false)}
 }
 const call=data?.call,incoming=call&&call.caller_side!==(platform?'SUPPORT':'RESTAURANT'),participant=call&&(call.caller_id===data?.userId||call.answered_by===data?.userId);
 return <div className="support-voice" aria-label="Support voice call"><audio ref={audio} autoPlay/>
  <div className="support-voice-controls">{!finished&&!call&&<button className="button" type="button" disabled={busy||!available||!data} title={available?'Start a browser voice call':'Voice requires HTTPS or localhost and microphone access'} onClick={()=>void act('start')}><Icon name="phone"/>Voice call</button>}
   {call&&<><span role="status"><Icon name="phone"/>{call.state==='RINGING'?(incoming?'Incoming call · '+call.caller_name:'Calling… waiting for an answer'):participant?(phase||'Connecting…'):'Call answered by another support specialist'}</span>{incoming&&call.state==='RINGING'&&<button className="button primary" type="button" disabled={busy||!available} onClick={()=>void act('answer')}>Answer</button>}{(participant||incoming&&call.state==='RINGING'||data?.canEndAll)&&<button className="button" type="button" disabled={busy} onClick={()=>void act('end',!!incoming&&call.state==='RINGING')}>{incoming&&call.state==='RINGING'?'Decline':'End call'}</button>}</>}
   {participant&&peer.current&&<button className="button" type="button" aria-pressed={muted} onClick={()=>{const next=!muted;stream.current?.getAudioTracks().forEach(track=>track.enabled=!next);setMuted(next)}}>{muted?'Unmute microphone':'Mute microphone'}</button>}
   {needsAudio&&<button className="button" type="button" onClick={()=>{void audio.current?.play().then(()=>setNeedsAudio(false)).catch(()=>setError('Allow audio playback in this browser.'))}}>Enable call audio</button>}
  </div>{phase&&!call&&<p role="status">{phase}</p>}{error&&<p role="alert" className="error">{error}</p>}{!available&&!finished&&<p>Calling needs HTTPS or localhost and microphone permission.</p>}<small>Browser audio · no recording · local-network connection. Keep this chat open during the call.</small>
 </div>;
}
