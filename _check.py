import sys
sys.path.insert(0, 'uploader')
from tsg_uploader import GH, load_conf
c = load_conf()
gh = GH(c['token'], c['owner'], 'tokyostation', 'main')
r = gh._req('/repos/%s/tokyostation/commits?per_page=15' % c['owner'])
for x in r:
    print(x['sha'][:8], x['commit']['author']['date'], x['commit']['message'].splitlines()[0])
