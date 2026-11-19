import csv
import io
from cohort_report import CAMPAIGN, rows_for, time
rows=[
 ('01','landing_visit','v','','false'),('01','landing_visit','v','','false'),('01','signup_start','v','','false'),
 ('02','signup_requested','v','a','false'),('02','account_confirmed','other-device','a','false'),
 ('02','first_stock_saved','other-device','a','false'),('03','first_stock_saved','','a','false'),
 ('01','landing_visit','v2','','false'),('01','signup_requested','v2','b','false'),('02','account_confirmed','','b','false'),
 ('10','first_stock_saved','','b','false'),('19','landing_visit','future','','false'),
 ('01','landing_visit','staff','','true')]
sample=io.StringIO();writer=csv.writer(sample)
writer.writerow(['timestamp','event','visitor_key','account_key','is_test',*CAMPAIGN])
for day,*content in rows:writer.writerow(['2026-11-'+day+'T10:00:00Z',*content,'instagram','creator','uk_launch','pilot'])
sample.seek(0)
report=list(rows_for(sample,time('2026-11-19T15:00:00Z')))
assert len(report)==1 and report[0][-5:]==[2,1,2,1,50.0],report
print('First touch, duplicate events, device handoff, late activation, test accounts and cohort maturity passed.')
