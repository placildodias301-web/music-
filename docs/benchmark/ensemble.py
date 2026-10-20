import json,collections,statistics
F=json.load(open('feats.json'));N=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
V=sorted({k for d in F.values() for k in d if k!='bpm'}); V=[v for v in V if v!='ess_edmm']
fold=lambda b:(lambda x:[x:=x*2 if x<75 else x for _ in range(3)][-1])(b) 
def fb(b):
    while b<75: b*=2
    while b>160: b/=2
    return b
R={}
for t,d in F.items():
    c=collections.Counter(tuple(d[v]) for v in V if v in d); (k,n),=c.most_common(1); tot=sum(c.values())
    bs=[fb(x) for x in d['bpm'].values()]; med=statistics.median(bs); agree=sum(abs(x-med)<=3 for x in bs)
    R[t]=dict(key=f"{N[k[0]]} {'Major' if k[1]==0 else 'Minor'}",votes=f"{n}/{tot}",bpm=round(med),bpm_agree=f"{agree}/4")
    print(t,R[t])
json.dump(R,open('ensemble_results.json','w'),indent=1)
