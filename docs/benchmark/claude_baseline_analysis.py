import subprocess,json,glob,os,numpy as np
D=os.path.expanduser("~/mnt/Analysis_demo folder")
maj=np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
mnr=np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
N=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
SR=22050;NF=8192;HOP=2048
out={}
def stft(y,n,h):
    w=np.hanning(n);fr=(len(y)-n)//h
    idx=np.arange(n)[None,:]+h*np.arange(fr)[:,None]
    return np.abs(np.fft.rfft(y[idx]*w,axis=1))
for f in sorted(glob.glob(D+"/TEST_*.mp4")):
    t=os.path.basename(f)[:8]; w="/tmp/%s.raw"%t
    subprocess.run(["ffmpeg","-y","-loglevel","error","-i",f,"-ac","1","-ar",str(SR),"-f","f32le",w],check=True)
    y=np.fromfile(w,dtype=np.float32)
    S=stft(y,NF,HOP); fr=np.fft.rfftfreq(NF,1/SR)
    m=(fr>=65)&(fr<=2000); fq=fr[m]; Sm=S[:,m]
    midi=69+12*np.log2(fq/440)
    # tuning offset: find shift minimizing distance to semitone grid, weighted by energy
    spec=Sm.sum(0)
    best=None
    for off in np.arange(-0.5,0.5,0.05):
        c=np.cos(2*np.pi*(midi-off)); s=(spec*c).sum()
        if best is None or s>best[0]: best=(s,off)
    off=best[1]
    pc=np.round(midi-off).astype(int)%12
    ch=np.zeros(12)
    mag=(Sm**2).sum(0)**0.5
    for p in range(12): ch[p]=mag[pc==p].sum()
    sc=sorted([(np.corrcoef(ch,np.roll(P,i))[0,1],N[i]+(" Major" if P is maj else " Minor")) for P in (maj,mnr) for i in range(12)],reverse=True)
    # tempo
    e=stft(y,1024,256); flux=np.maximum(0,np.diff(np.log1p(100*e),axis=0)).sum(1)
    flux=flux-np.convolve(flux,np.ones(43)/43,'same'); flux=np.maximum(flux,0)
    fps=SR/256; ac=np.correlate(flux,flux,'full')[len(flux)-1:]
    lags=np.arange(len(ac)); bpm=60*fps/np.maximum(lags,1)
    sel=(bpm>=60)&(bpm<=180)
    pri=np.exp(-0.5*(np.log2(bpm/110)/0.7)**2)
    sc2=np.where(sel,ac*pri,0); L=int(sc2.argmax())
    tempo=60*fps/L
    out[t]=dict(key=sc[0][1],r=round(float(sc[0][0]),3),second=sc[1][1],r2=round(float(sc[1][0]),3),third=sc[2][1],bpm=round(float(tempo),1),tuning_cents=round(float(off*100),1))
    print(t,out[t],flush=True)
json.dump(out,open(os.path.expanduser("~/claude_est.json"),"w"),indent=1)
