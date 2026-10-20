import json,random,itertools,collections
F=json.load(open('feats.json'))
N=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def K(s):
    t,m=s.split(); return (N.index(t),0 if m=='M' else 1)
T={ 'TEST_001':[K('B M')],'TEST_002':[K('D M')],'TEST_003':[K('A# M')],'TEST_004':[K('E M')],'TEST_005':[K('D# M')],'TEST_006':[K('G M')],'TEST_007':[K('E m')],'TEST_008':[K('E M')],'TEST_009':[K('D m')],'TEST_011':[K('G M'),K('E M')],'TEST_012':[K('G# m')],'TEST_013':[K('C M')],'TEST_014':[K('C m')],'TEST_015':[K('C M')],'TEST_016':[K('A m')],'TEST_017':[K('D M')],'TEST_018':[K('G M')],'TEST_019':[K('F M')],'TEST_020':[K('E M')]}
V=sorted({k for d in F.values() for k in d if k!='bpm'})
ok=lambda t,k: tuple(k) in T[t]
ids=sorted(T)
acc={v:sum(ok(t,F[t][v]) for t in ids if v in F[t])/len(ids) for v in V}
print('ALL-19 single voters:');[print(f'  {v:18s}{acc[v]*100:5.1f}%') for v in sorted(V,key=lambda v:-acc[v])]
def vote(t,vs):
    c=collections.Counter(tuple(F[t][v]) for v in vs if v in F[t]); return c.most_common(1)[0][0]
def best_subset(train):
    # greedy: top voters by train acc then odd-sized majority
    sc={v:sum(ok(t,F[t][v]) for t in train) for v in V}
    r=sorted(V,key=lambda v:-sc[v]); best=(0,None)
    for n in (1,3,5,7,9):
        vs=r[:n]; a=sum(ok(t,vote(t,vs)) for t in train)
        if a>best[0]: best=(a,vs)
    return best[1]
random.seed(7);ids2=ids[:];random.shuffle(ids2)
tr,te=ids2[:12],ids2[12:]
vs=best_subset(tr)
print('\nTRAIN',len(tr),'TEST',len(te),'| chosen voters',vs)
print(' train acc',sum(ok(t,vote(t,vs)) for t in tr)/len(tr),' test acc',sum(ok(t,vote(t,vs)) for t in te)/len(te))
print(' baseline essentia bgate test acc',sum(ok(t,F[t]['ess_bgate']) for t in te)/len(te))
# leave-one-out
h=0;miss=[]
for t in ids:
    vs=best_subset([x for x in ids if x!=t])
    r=ok(t,vote(t,vs)); h+=r
    if not r: miss.append(t)
print('\nLOOCV acc',h,'/',len(ids),'misses',miss)
vsall=best_subset(ids);print('final voters (fit on all 19):',vsall)
print('final acc (in-sample)',sum(ok(t,vote(t,vsall)) for t in ids),'/19')
json.dump({'voters':vsall,'pred':{t:vote(t,vsall) for t in F}},open('final_keys.json','w'))
print('\n--- untuned fixed ensembles (no fitting) ---')
std=['ess_krumhansl','ess_temperley','ess_temperley2005','ess_edma','ess_bgate','ess_shaath','ess_noland','ess_braw','ess_thpcp','ess_tonictriad']
for name,vs in (('all17',V),('essentia-standard10',std)):
    r=[t for t in ids if not ok(t,vote(t,vs))]
    print(name,len(ids)-len(r),'/19 misses',r)
print({t:F[t]['bpm'] for t in ['TEST_001','TEST_003']})
