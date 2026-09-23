import sys, json
sys.path.insert(0, 'uploader')
from tsg_uploader import GH, load_conf
c = load_conf()
gh = GH(c['token'], c['owner'], 'tokyostation', 'main')
print('--- PAGES SETTINGS ---')
try:
    r = gh._req('/repos/%s/tokyostation/pages' % c['owner'])
    print(json.dumps(r, indent=2)[:1500])
except Exception as e:
    print('ERR', e)
print('--- COLLABORATORS ---')
try:
    r = gh._req('/repos/%s/tokyostation/collaborators' % c['owner'])
    for u in r:
        print(u.get('login'), u.get('permissions'))
except Exception as e:
    print('ERR', e)
