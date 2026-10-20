import glob,os,json,numpy as np,librosa,essentia.standard as es
N=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
nm=lambda m:f"{N[int(m)%12]}{int(m)//12-1}"
def conf(x,lo,hi): return 'High' if x>=hi else 'Medium' if x>=lo else 'Low'
def pick(ev,k=10):
    ev=[e for e in ev if e['end']-e['start']>=0.12]
    if not ev: return []
    med=np.median([e['sal'] for e in ev]); ev=[e for e in ev if e['sal']>=med]
    return sorted(ev,key=lambda e:e['start'])[:k]
R={}
for f in sorted(glob.glob('/mnt/user-data/uploads/Analysis_demo folder/_wav/*.wav')):
    t=os.path.basename(f)[:8]
    a=es.MonoLoader(filename=f,sampleRate=44100)()
    a=es.EqualLoudness()(a)
    pitch,pc=es.PredominantPitchMelodia(frameSize=2048,hopSize=128,minFrequency=80,maxFrequency=1200,voicingTolerance=0.9)(a)
    on,dur,mid=es.PitchContourSegmentation(hopSize=128,sampleRate=44100,minDuration=0.1)(pitch,a)
    sal=np.interp(on*44100/128,np.arange(len(pc)),pc) if len(pc) else np.zeros(len(on))
    ess=[dict(start=float(o),end=float(o+d),note=nm(round(m)),sal=float(s)) for o,d,m,s in zip(on,dur,mid,sal)]
    y,sr=librosa.load(f,sr=22050)
    f0,vf,vp=librosa.pyin(y,fmin=80,fmax=1200,sr=sr,frame_length=2048,hop_length=256)
    midi=np.where(vf,np.round(librosa.hz_to_midi(np.nan_to_num(f0,nan=1))),-1); tt=librosa.times_like(f0,sr=sr,hop_length=256)
    py=[];i=0
    while i<len(midi):
        if midi[i]<0: i+=1; continue
        j=i
        while j+1<len(midi) and midi[j+1]==midi[i]: j+=1
        py.append(dict(start=float(tt[i]),end=float(tt[j]+256/sr),note=nm(midi[i]),sal=float(np.mean(vp[i:j+1])))); i=j+1
    def pk(ev):
        ev=pick(ev); 
        return [dict(start=round(e['start'],2),end=round(e['end'],2),note=e['note'],conf=conf(e['sal'],0.4,0.7)) for e in ev]
    R[t]=dict(other_repo=pk(ess),claude=pk(py),n_ess=len(ess),n_py=len(py)); print(t,len(ess),len(py),flush=True)
json.dump(R,open('notes_results.json','w'),indent=1)
