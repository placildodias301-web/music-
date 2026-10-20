import glob,os,json
from tempo_meter import analyze
R={}
for f in sorted(glob.glob('/mnt/user-data/uploads/Analysis_demo folder/_wav/*.wav')):
    t=os.path.basename(f)[:8]; R[t]=analyze(f); print(t,R[t]['pulse_bpm'],R[t]['measured_bpm'],R[t]['tempo_conf'],R[t]['meter']['ts'],R[t]['meter']['conf'],flush=True)
json.dump(R,open('tempo_meter_results.json','w'),indent=1,default=float)
