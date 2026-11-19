"""Report mature first-touch cohorts from a pseudonymous funnel event CSV. All timestamps must include a timezone."""
import argparse
from collections import defaultdict
import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

EVENTS={'landing_visit','signup_start','signup_requested','account_confirmed','first_stock_saved'}
CAMPAIGN=('source','medium','campaign','content')
FIELDS={'timestamp','event','visitor_key','account_key','is_test',*CAMPAIGN}
LONDON=ZoneInfo('Europe/London')

def time(value):
    result=datetime.fromisoformat(value.replace('Z','+00:00'))
    if result.tzinfo is None: raise ValueError('Each timestamp needs an explicit timezone')
    return result.astimezone(timezone.utc)

def rows_for(stream, asof):
    reader=csv.DictReader(stream)
    if not FIELDS.issubset(reader.fieldnames or []): raise ValueError('Missing funnel event columns')
    entries=[]
    for r in reader:
        if r['event'] not in EVENTS: continue
        flag=r['is_test'].strip().lower()
        if flag not in ('false','0','true','1'): raise ValueError('is_test must be true/false')
        if flag in ('true','1'): continue
        stamp=time(r['timestamp'])
        if stamp<=asof: entries.append((stamp,r))
    entries.sort(key=lambda p:p[0])
    visits,starts,owners={},defaultdict(list),{}
    confirmed,saved=defaultdict(list),defaultdict(list)
    for stamp,r in entries:
        kind,visitor,account=r['event'],r['visitor_key'],r['account_key']
        if kind=='landing_visit' and visitor:
            visits.setdefault(visitor,(stamp,tuple(r[k] or 'unattributed' for k in CAMPAIGN)))
        elif kind=='signup_start' and visitor: starts[visitor].append(stamp)
        elif kind=='signup_requested' and visitor and account:
            if visitor in visits: owners.setdefault(account,(visitor,stamp))
        elif kind=='account_confirmed' and account: confirmed[account].append(stamp)
        elif kind=='first_stock_saved' and account: saved[account].append(stamp)
    links=defaultdict(list)
    for account,(visitor,when) in owners.items(): links[visitor].append((account,when))
    totals=defaultdict(lambda:[0,0,0,0])
    for visitor,(start,labels) in visits.items():
        # Publish complete calendar weeks only; the last visitor also needs their full seven days.
        local_day=start.astimezone(LONDON).date()
        monday=local_day-timedelta(days=local_day.weekday())
        end_of_week=datetime.combine(monday+timedelta(days=7),datetime.min.time(),tzinfo=LONDON)
        if end_of_week.astimezone(timezone.utc)+timedelta(days=7)>asof: continue
        until=start+timedelta(days=7)
        counts=totals[(monday.isoformat(),*labels)]
        counts[0]+=1
        counts[1]+=int(any(start<=s<=until for s in starts[visitor]))
        did_confirm=did_save=False
        for account,request in links[visitor]:
            earliest=next((c for c in confirmed[account] if start<=request<=c<=until),None)
            if earliest is None:continue
            did_confirm=True
            if any(earliest<=s<=until for s in saved[account]): did_save=True
        counts[2]+=int(did_confirm);counts[3]+=int(did_save)
    for group,(visits,starts,confirms,activations) in sorted(totals.items()):
        yield [*group,visits,starts,confirms,activations,round(100*activations/visits,2)]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input',type=Path)
    parser.add_argument('output',type=Path)
    parser.add_argument('--as-of',help='Clock for repeatable reporting, e.g. 2026-11-19T00:00:00Z')
    a=parser.parse_args()
    asof=time(a.as_of) if a.as_of else datetime.now(timezone.utc)
    with a.input.open(encoding='utf-8-sig',newline='') as source:
        rows=list(rows_for(source,asof))
    with a.output.open('w',newline='',encoding='utf-8') as target:
        writer=csv.writer(target)
        writer.writerow(['week_start_uk',*CAMPAIGN,'visitors','visitors_started','visitors_confirmed','visitors_activated','activation_per_100_visits'])
        writer.writerows(rows)

if __name__=='__main__': main()
