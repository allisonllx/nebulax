import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BusFront, CalendarDays, Check, Clock3, Footprints, HeartHandshake, MapPin, Phone, ShieldCheck, TrainFront, TriangleAlert, Volume2 } from 'lucide-react';
import { LiveMap } from './LiveMap';
import { arrival, time } from './journey';
import type { Journey, Language, Snapshot } from './journey';
import { dialNumber } from './profile';

type ContactProps = { language: Language; phone?: string; onHelp: () => void };
export function FamilyContact({ language, phone, onHelp }: ContactProps) {
  const label = language === 'zh' ? '联系女儿' : 'Call Mei Ling';
  return phone ? <a className="calm-contact" href={`tel:${dialNumber(phone)}`}><Phone size={23}/>{label}</a>
    : <button className="calm-contact" onClick={onHelp}><Phone size={23}/>{label}</button>;
}

export function ElderHome({ journey, language, linked, phone, disabled, onStart, onDetails, onHelp }: {
  journey: Journey; language: Language; linked: boolean; phone?: string; disabled: boolean;
  onStart: () => void; onDetails: () => void; onHelp: () => void;
}) {
  const zh = language === 'zh';
  const destination = journey.destination?.name[language] ?? (zh ? '陈笃生医院' : 'Tan Tock Seng Hospital');
  return <section className="calm-home">
    <div className="calm-welcome"><span className="calm-eyebrow">{zh ? '熟悉的路 · 有人伴行' : 'FAMILIAR ROUTES. A LITTLE SUPPORT.'}</span>
      <h1 tabIndex={-1}>{zh ? '陈伯，早上好' : 'Good morning, Mr Tan.'}</h1>
      <p>{zh ? '慢慢来，我们陪您一起走。' : 'Take your time. We’ll guide you along the way.'}</p>
    </div>
    <div className="calm-home-art" aria-hidden="true"><HeartHandshake size={76} strokeWidth={1.2}/><span className="calm-art-path"/><MapPin size={32}/></div>
    <div className="calm-appointment"><CalendarDays size={32}/><div><span>{zh ? '下一段行程' : 'YOUR NEXT JOURNEY'}</span><h2>{destination}</h2>
      <p className="calm-departure">{time(journey.departureTime)} <small>{zh ? '出门' : 'leave home'}</small></p></div>
      <p className="calm-prepared">{linked ? (zh ? '美玲已经为您准备好路线' : 'Mei Ling has prepared your route.') : (zh ? '路线已经准备好，按自己的步速走。' : 'Your route is ready. Walk at your own pace.')}</p>
    </div>
    <button className="calm-primary" disabled={disabled} onClick={onStart}><ArrowRight/>{zh ? '开始行程' : 'Start journey'}</button>
    <FamilyContact language={language} phone={phone} onHelp={onHelp}/>
    <button className="calm-text" onClick={onDetails}>{zh ? '查看完整路线' : 'See the full route'} <ArrowRight size={17}/></button>
  </section>;
}

export function ElderGuidance({ journey, language, index, position, remaining, off, recovering, recovered, previous, onContinue, onRepeat, onHelp, phone, controls, onDetails, onBack }: {
  journey: Journey; language: Language; index: number; position: {lat:number;lon:number} | null;
  remaining?: number; off: boolean; recovering: boolean; recovered: boolean; previous?: Journey;
  onContinue: () => void; onRepeat: () => void; onHelp: () => void; phone?: string; controls: ReactNode; onDetails: () => void;
  onBack: () => void;
}) {
  const zh = language === 'zh'; const step = journey.steps[index];
  const recovery = off || recovering || recovered;
  const Icon = step.mode === 'bus' ? BusFront : step.mode === 'train' ? TrainFront : Footprints;
  return <section className={`calm-guidance ${recovery ? 'is-recovering' : ''}`}>
    <div className="calm-progress"><span>{zh ? `第 ${index+1} 步，共 ${journey.steps.length} 步` : `Step ${index+1} of ${journey.steps.length}`}</span><span className="calm-dots" aria-hidden="true">{journey.steps.map((s,i)=><i key={s.id} className={i<=index?'filled':''}/>)}</span></div>
    {recovery ? <div className="calm-recovery" role="status"><TriangleAlert size={34}/><div><h1>{recovered ? (zh ? '新路线已准备好' : 'Your new route is ready') : (zh ? '路线变了，请先停一下' : 'The route has changed — please stop for a moment')}</h1><p>{recovered ? (zh ? '请听新的指引，再继续前行。' : 'Listen to the new directions before continuing.') : (zh ? '请在安全的地方停下，我们会帮助您找到方向。' : 'Stop somewhere safe. We’ll help you find your way.')}</p></div></div>
      : <div className="calm-instruction"><span className="calm-step-symbol"><Icon size={44} strokeWidth={1.7}/></span><h1 tabIndex={-1} data-testid="elder-current-instruction">{step.instruction[language]}</h1>
        {/* How far and which way — the same facts the voice reads, never hidden behind a disclosure. */}
        {remaining !== undefined && <p className="calm-remaining">{zh ? `大约还有 ${remaining} 米` : `About ${remaining} m to go`}</p>}
        {step.directions[0] && <p className="calm-heading-line">{step.directions[0][language]}</p>}
        {remaining === undefined && !step.directions[0] && step.mode === 'walk' && step.distanceMetres != null && <p className="calm-distance">{zh ? `这一段共约 ${step.distanceMetres} 米` : `About ${step.distanceMetres} m on this stretch`}</p>}
        <p className="calm-place-line">{step.detail[language]}</p></div>}
    <div className="calm-orientation" role="region" aria-label={zh ? '当前步骤方向地图' : 'Current-step orientation map'}><LiveMap journey={journey} original={recovery ? previous : undefined} language={language} currentLegId={step.legId} position={position} density="elder"/>
      <span className="calm-map-caption"><MapPin size={16}/>{position ? (zh ? '蓝点是您当前的位置' : 'The blue dot shows your position') : (zh ? '路线预览 · 开启定位后显示您的位置' : 'Route preview · enable location to see yourself')}</span>
    </div>
    {recovering && <p className="calm-voice" role="status">{zh ? '正在寻找新路线，请稍候…' : 'Finding a new route. Please wait…'}</p>}
    {recovered ? <button className="calm-primary" onClick={onContinue}><ArrowRight/>{zh ? '按新路线继续' : 'Continue on the new route'}</button>
      : <button className="calm-primary" onClick={onRepeat}><Volume2/>{zh ? '再说一次' : 'Say it again'}</button>}
    <FamilyContact language={language} phone={phone} onHelp={onHelp}/>
    {controls}
    {!recovery && step.directions.length>1 && <details className="calm-disclosure"><summary>{zh ? '后续步行指引' : 'The rest of this walk'}</summary><ol>{step.directions.slice(1).map((d,i)=><li key={i}>{d[language]}</li>)}</ol></details>}
    <button className="calm-text" onClick={onBack}><ArrowLeft size={17}/>{index > 0 ? (zh ? '回到上一步' : 'Back a step') : (zh ? '还没出发，回到首页' : 'Not started yet — go back')}</button>
    <button className="calm-text" onClick={onDetails}>{zh ? '查看完整路线' : 'See the full route'}<ArrowRight size={17}/></button>
  </section>;
}

export function CaregiverDashboard({ snapshot, language, position, onDismiss, onDetails, onFamily }: {
  snapshot: Snapshot; language: Language; position: {lat:number;lon:number;at:number;off:boolean}|null;
  onDismiss: () => void; onDetails: () => void; onFamily: () => void;
}) {
  const zh=language==='zh'; const {journey,phase,family,lostAlert,lastDeviation}=snapshot;
  const shared=family.linked&&family.scopes.tripUpdates;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 2000); return () => window.clearInterval(timer); }, []);
  const fresh=position&&now-position.at<20000;
  const alert=shared?lostAlert:null;
  return <section className="calm-caregiver"><div><span className="calm-eyebrow">{zh?'家人看护':'FAMILY CARE'}</span><h1 tabIndex={-1}>{zh?'爸爸的行程':'Dad’s journey'}</h1></div>
    <p className="calm-local">{zh?'本机演示 · 未连接家人的手机，不发送远程通知':'Local preview · no remote device or notifications connected'}</p>
    {!shared ? <div className="calm-status"><ShieldCheck/><p>{zh?'尚未开启行程共享，请先设置家属权限。':'Trip updates are not shared. Set up family permissions first.'}</p></div> : <>
      <div className={`calm-status ${alert?'is-alert':''}`} role={alert?'alert':'status'}>{alert?<TriangleAlert/>:<ShieldCheck/>}<div><h2>{alert?(zh?'爸爸偏离了路线':'Dad is off the planned route'):phase==='active'?(zh?'正在前往目的地':'On the way'):phase==='arrived'?(zh?'已确认到达':'Arrival confirmed'):(zh?'路线已准备好':'Ready to leave')}</h2>
        <p>{alert ? (zh?`偏离约 ${alert.routeMetres} 米 · ${time(alert.at)} 更新`:`About ${alert.routeMetres} m off route · updated ${time(alert.at)}`) : fresh ? (position.off?(zh?'正在检查路线':'Checking the route'):(zh?'位置正常 · 刚刚更新':'Position normal · updated just now')):(zh?'暂无实时位置 · 需保持长辈端打开':'No live position · keep the elder screen open')}</p>
        {alert&&<button className="calm-text" onClick={onDismiss}><Check size={18}/>{zh?'我已确认情况':'I have checked on him'}</button>}</div></div>
      <LiveMap journey={journey} language={language} position={fresh?position:alert?{lat:alert.lat,lon:alert.lon}:null} density="caregiver"/>
      {alert&&!fresh&&<p className="calm-local">{zh?'地图显示警报发生时的位置，不是实时位置。':'Map shows the location recorded at the alert, not a live position.'}</p>}
      <div className="calm-trip-meta"><div><MapPin/><span>{zh?`第 ${snapshot.stepIndex+1} 步，共 ${journey.steps.length} 步`:`Step ${snapshot.stepIndex+1} of ${journey.steps.length}`}</span></div><div><Clock3/><span>{zh?'预计到达':'Estimated arrival'}<strong>{arrival(journey)}</strong></span></div></div>
      {lastDeviation&&<p className="calm-event"><Check size={18}/>{time(lastDeviation.at)} {zh?'曾偏离路线，已重新规划':'Route replanned after a deviation'}</p>}
    </>}
    {snapshot.profile?.travellerPhone ? <a className="calm-primary" href={`tel:${dialNumber(snapshot.profile.travellerPhone)}`}><Phone/>{zh?'联系爸爸':'Call Dad'}</a> : <button className="calm-primary" onClick={onFamily}><Phone/>{zh?'设置爸爸的联系电话':'Set up Dad’s contact number'}</button>}
    {shared&&<button className="calm-contact" onClick={onDetails}>{zh?'查看行程详情':'Trip details'}<ArrowRight size={20}/></button>}
  </section>;
}
