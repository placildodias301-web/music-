import glob,os,json,numpy as np,essentia.standard as es,librosa
PROFS=['krumhansl','temperley','temperley2005','edma','edmm','bgate','braw','shaath','noland','weichet','diatonic','tonictriad','thpcp','gomez']
N=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
maj=np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]);mnr=np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
tmaj=np.array([5,2,3.5,2,4.5,4,2,4.5,2,3.5,1.5,4]);tmin=np.array([5,2,3.5,4.5,2,4,2,4.5,3.5,2,1.5,4])
E={'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#'}
def norm(k):
    t,m=k.split()[:2]; return (N.index(E.get(t,t)),0 if m=='major' else 1)
def ks(ch,P1,P2):
    s=[(np.corrcoef(ch,np.roll(P,i))[0,1],(i,m)) for m,P in ((0,P1),(1,P2)) for i in range(12)]
    return max(s)[1]
out={}
for f in sorted(glob.glob('/mnt/user-data/uploads/Analysis_demo folder/_wav/*.wav')):
    t=os.path.basename(f)[:8]; d={}
    a=es.MonoLoader(filename=f,sampleRate=44100)()
    for p in PROFS:
        try: k,s,st=es.KeyExtractor(profileType=p)(a); d['ess_'+p]=norm(k+' '+s)
        except Exception as e: pass
    y,sr=librosa.load(f,sr=22050); yh=librosa.effects.harmonic(y)
    tun=librosa.estimate_tuning(y=yh,sr=sr)
    c=librosa.feature.chroma_cqt(y=yh,sr=sr,tuning=tun).mean(1)
    cb=librosa.feature.chroma_cqt(y=yh,sr=sr,tuning=tun,fmin=librosa.note_to_hz('C1'),n_octaves=3).mean(1)
    cs=librosa.feature.chroma_cens(y=yh,sr=sr,tuning=tun).mean(1)
    d['lib_ks']=ks(c,maj,mnr);d['lib_tmp']=ks(c,tmaj,tmin);d['lib_bass_ks']=ks(0.6*c+0.4*cb,maj,mnr);d['lib_cens']=ks(cs,maj,mnr)
    # tempo candidates
    b1=es.RhythmExtractor2013(method='multifeature')(a)[0]; b2=es.RhythmExtractor2013(method='degara')(a)[0]
    oe=librosa.onset.onset_strength(y=y,sr=sr)
    b3=float(np.atleast_1d(librosa.beat.beat_track(onset_envelope=oe,sr=sr)[0])[0])
    b4=float(np.atleast_1d(librosa.feature.rhythm.tempo(onset_envelope=oe,sr=sr))[0])
    d['bpm']={'ess_multi':float(b1),'ess_degara':float(b2),'lib_beat':b3,'lib_tempo':b4}
    out[t]=d; print(t,flush=True)
json.dump(out,open('feats.json','w'))
