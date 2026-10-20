"""BPM + meter evidence extractor (independent of Wilsify code). Output is MEASURED/DETECTED, never ground truth."""
import numpy as np,librosa,essentia.standard as es,statistics
SR=22050;HOP=256;FPS=SR/HOP
def fold(b,lo=55,hi=200):
    while b<lo:b*=2
    while b>hi:b/=2
    return b
def methods(y,sr,a44):
    o=librosa.onset.onset_strength(y=y,sr=sr,hop_length=HOP)
    out={}
    r=es.RhythmExtractor2013(method='multifeature')(a44); out['ess_multifeature']=float(r[0]); ticks=np.array(r[1])
    out['ess_degara']=float(es.RhythmExtractor2013(method='degara')(a44)[0])
    out['lib_beat_track']=float(np.atleast_1d(librosa.beat.beat_track(onset_envelope=o,sr=sr,hop_length=HOP)[0])[0])
    tg=librosa.feature.tempogram(onset_envelope=o,sr=sr,hop_length=HOP).mean(1)
    bpms=librosa.tempo_frequencies(len(tg),sr=sr,hop_length=HOP); m=(bpms>=50)&(bpms<=220); out['tempogram']=float(bpms[m][tg[m].argmax()])
    ac=librosa.autocorrelate(o,max_size=int(FPS*3)); lags=np.arange(len(ac)); b=60*FPS/np.maximum(lags,1); m=(b>=50)&(b<=220); out['autocorr']=float(b[m][ac[m].argmax()])
    on=librosa.onset.onset_detect(onset_envelope=o,sr=sr,hop_length=HOP,units='time'); ioi=np.diff(on); ioi=ioi[(ioi>0.15)&(ioi<1.5)]
    if len(ioi)>8:
        h,e=np.histogram(60/ioi,bins=np.arange(40,260,2)); out['ioi_hist']=float(e[h.argmax()]+1)
    return o,ticks,out
def choose(raw):
    # cluster octave-equivalent values; pick the pulse level with most DIRECT support
    vals=list(raw.values()); best=None
    for c in vals:
        for cand in (c,c/2,c*2):
            if not 55<=cand<=200: continue
            direct=sum(abs(v-cand)/cand<0.04 for v in vals); octv=sum(any(abs(v*f-cand)/cand<0.04 for f in (0.5,1,2)) for v in vals)
            prior=np.exp(-0.5*(np.log2(cand/105)/0.8)**2)
            s=direct*1.0+octv*0.4+prior
            if best is None or s>best[0]: best=(s,cand,direct,octv)
    return best
def beat_stats(ticks,bpm):
    if len(ticks)<6: return dict(n=len(ticks),median=None,cv=None)
    d=np.diff(ticks); T=60/bpm
    # tracker may be at another octave: rescale intervals to the chosen pulse
    for f in (1,2,0.5):
        if abs(np.median(d)*f-T)/T<0.15: d=d*f if f<=1 else d*f; break
    med=float(np.median(d)); mad=float(np.median(abs(d-med)))
    return dict(n=int(len(ticks)),median=60/med,cv=round(100*1.4826*mad/med,1))
def meter(y,sr,o,bpm):
    T=60/bpm*FPS; ph=max(range(24),key=lambda i:np.mean([o[min(len(o)-1,int(round(i*T/24+k*T)))] for k in range(int((len(o)-T)/T))]))*T/24
    nb=int((len(o)-ph-T)/T); 
    if nb<12: return dict(ts='INSUFFICIENT EVIDENCE',conf='LOW',note=f'only {nb} beats',grouping=None,subdiv=None)
    pos=lambda f:np.clip(np.round(ph+(np.arange(nb)+f)*T).astype(int),0,len(o)-1)
    mx=lambda f:np.maximum.reduce([o[np.clip(pos(f)+d,0,len(o)-1)] for d in (-1,0,1)])
    b0=mx(0); half=mx(.5).mean(); t3=(mx(1/3).mean()+mx(2/3).mean())/2; q=(mx(.25).mean()+mx(.75).mean())/2
    # subdivision: triplet if 1/3,2/3 clearly beat 1/2
    sub=3 if t3>half*1.15 else 2
    # downbeat accent: onset at beat + chroma change
    ch=librosa.feature.chroma_cqt(y=y,sr=sr,hop_length=HOP); fl=np.r_[0,np.linalg.norm(np.diff(ch,axis=1),axis=0)]
    c0=np.maximum.reduce([fl[np.clip(pos(0)+d,0,len(fl)-1)] for d in (-2,-1,0,1,2)])
    z=lambda x:(x-x.mean())/(x.std()+1e-9); acc=z(b0)+z(c0)
    res={}
    for P in (2,3,4):
        best=max(( acc[(np.arange(nb)-p)%P==0].mean()-acc[(np.arange(nb)-p)%P!=0].mean(),p) for p in range(P)); res[P]=best[0]
    # penalise multiples: P=4 contains P=2 structure, P=6 contains 2 and 3
    adj={2:res[2],3:res[3],4:res[4]-0.5*res[2]}
    rank=sorted(adj,key=lambda k:-adj[k]); P=rank[0]; margin=adj[P]-adj[rank[1]]
    names={(2,2):'2/4',(3,2):'3/4',(4,2):'4/4',(6,2):'6/4',(2,3):'6/8',(3,3):'9/8',(4,3):'12/8',(6,3):'18/8'}
    ts=names[(P,sub)]
    strength=adj[P]; conf='MEDIUM' if (strength>0.5 and margin>0.25) else 'LOW'
    if strength<0.25 or margin<0.08: ts='AMBIGUOUS'; conf='LOW'
    return dict(ts=ts,conf=conf,grouping=P if ts!='AMBIGUOUS' else None,subdiv=sub if ts!='AMBIGUOUS' else None,
        note=f'accent period={P} beats (score {strength:.2f}, margin {margin:.2f}); triplet-vs-duple subdiv ratio {t3/(half+1e-9):.2f}; {nb} beats',beats=nb)
def analyze(path):
    y,sr=librosa.load(path,sr=SR); a44=es.MonoLoader(filename=path,sampleRate=44100)()
    o,ticks,raw=methods(y,sr,a44); s,b,direct,octv=choose(raw)
    st=beat_stats(ticks,b); measured=st['median'] or b
    n=len(raw); agree=direct/n
    if st['n']<12: tc='LOW';tn='INSUFFICIENT EVIDENCE: few beats'
    elif st['cv'] and st['cv']>8: tc='LOW';tn='VARIABLE TEMPO'
    elif direct>=4 and (st['cv'] or 0)<5: tc='HIGH';tn=''
    elif direct>=3: tc='MEDIUM';tn=''
    else: tc='LOW';tn='methods disagree (octave/tempo ambiguity)'
    m=meter(y,sr,o,measured)
    return dict(raw={k:round(v,1) for k,v in raw.items()},pulse_bpm=round(float(b),1),measured_bpm=round(float(measured),2),beats=st['n'],cv_pct=st['cv'],direct_support=f'{direct}/{n}',
        half=round(b/2,1),double=round(b*2,1),tempo_conf=tc,tempo_note=tn,meter=m)
