-- Demo week: 19–25 October 2026. Run once or rerun safely for these fixed IDs.
INSERT INTO users (id,name,timezone) VALUES
('11111111-1111-4111-8111-111111111111','You','Europe/London'),
('22222222-2222-4222-8222-222222222222','Sam','Europe/London'),
('33333333-3333-4333-8333-333333333333','Priya','Europe/London'),
('44444444-4444-4444-8444-444444444444','Jo','Europe/London')
ON CONFLICT (id) DO NOTHING;

INSERT INTO groups (id,name) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Uni friends')
ON CONFLICT (id) DO NOTHING;

INSERT INTO group_members(group_id,user_id)
SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, id FROM users
WHERE id IN ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444')
ON CONFLICT DO NOTHING;

-- Times are specified with Europe/London timezone, then stored as timestamptz.
INSERT INTO busy_blocks(id,user_id,during,source) VALUES
('a0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',tstzrange('2026-10-19 10:00 Europe/London'::timestamptz,'2026-10-19 13:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',tstzrange('2026-10-21 15:00 Europe/London'::timestamptz,'2026-10-21 18:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222',tstzrange('2026-10-20 16:00 Europe/London'::timestamptz,'2026-10-20 19:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000004','22222222-2222-4222-8222-222222222222',tstzrange('2026-10-23 17:00 Europe/London'::timestamptz,'2026-10-23 23:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000005','33333333-3333-4333-8333-333333333333',tstzrange('2026-10-19 16:00 Europe/London'::timestamptz,'2026-10-19 20:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000006','33333333-3333-4333-8333-333333333333',tstzrange('2026-10-22 17:00 Europe/London'::timestamptz,'2026-10-22 21:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000007','44444444-4444-4444-8444-444444444444',tstzrange('2026-10-20 09:00 Europe/London'::timestamptz,'2026-10-20 12:00 Europe/London'::timestamptz,'[)'),'manual'),
('a0000000-0000-4000-8000-000000000008','44444444-4444-4444-8444-444444444444',tstzrange('2026-10-24 18:00 Europe/London'::timestamptz,'2026-10-24 21:00 Europe/London'::timestamptz,'[)'),'manual')
ON CONFLICT (id) DO NOTHING;

INSERT INTO preferences(id,group_id,user_id,category,value) VALUES
('b0000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','activity','Likes weekend brunch'),
('b0000000-0000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','time','Prefers afternoons over mornings'),
('b0000000-0000-4000-8000-000000000003','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,'budget','Prefer low-cost activities')
ON CONFLICT (id) DO NOTHING;

INSERT INTO beliefs(id,group_id,subject_user_id,statement,confidence) VALUES
('c0000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','Sam may be available on Friday evenings',0.550),
('c0000000-0000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','Priya prefers weekend brunch',0.800),
('c0000000-0000-4000-8000-000000000003','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','Jo prefers afternoon meetups',0.700)
ON CONFLICT (id) DO NOTHING;
