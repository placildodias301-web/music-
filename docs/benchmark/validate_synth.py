import numpy as np,soundfile as sf,os,json
from tempo_meter import analyze
sr=22050;rng=np.random.default_rng(1)
def pluck(f,n,sr):
    t=np.arange(n)/sr; return sum(np.sin(2*np.pi*f*k*t)/k for k in (1,2,3))*np.exp(-t*6)
def make(bpm,P,sub,bars=16,fn='s.wav'):
    beat=60/bpm; total=int(sr*beat*P*bars)+sr; y=np.zeros(total)
    chords=[110,130.8,98,123.5]
    for bar in range(bars):
        f=chords[bar%4]
        for b in range(P):
            for s in range(sub):
                t=(bar*P+b+s/sub)*beat; i=int(t*sr); n=int(0.5*sr)
                amp=1.0 if (b==0 and s==0) else 0.7 if s==0 else 0.35
                if bar%4==0 and b==0 and s==0: amp=1.3
                y[i:i+n]+=amp*pluck(f,min(n,total-i),sr)[:min(n,total-i)]
    y+=rng.normal(0,0.01,len(y)); sf.write(fn,y/np.abs(y).max()*0.8,sr)
cases=[(60,4,2,'4/4'),(80,3,2,'3/4'),(100,4,2,'4/4'),(100,2,3,'6/8'),(120,4,2,'4/4'),(120,4,3,'12/8'),(140,3,2,'3/4'),(160,4,2,'4/4')]
out=[]
for bpm,P,sub,ts in cases:
    make(bpm,P,sub); r=analyze('s.wav')
    out.append(dict(true_bpm=bpm if sub==2 else bpm,true_ts=ts,meas=r['measured_bpm'],pulse=r['pulse_bpm'],ts=r['meter']['ts'],conf=r['meter']['conf'],tconf=r['tempo_conf']))
    print(out[-1],flush=True)
json.dump(out,open('synth_validation.json','w'),indent=1)
