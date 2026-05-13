-- Seed canonical topic set (§5). New topics may be added later via INSERT.
-- Migration is idempotent so running on an already-seeded DB is a no-op.

INSERT INTO topics (slug, name, sort_order) VALUES
  ('customs',   'Customs',   10),
  ('sets',      'Sets',      20),
  ('life',      'Life',      30),
  ('fyp',       'FYP',       40),
  ('ppv',       'PPV',       50),
  ('sextings',  'Sextings',  60),
  ('reddit',    'Reddit',    70),
  ('instagram', 'Instagram', 80),
  ('pictures',  'Pictures',  90)
ON CONFLICT (slug) DO NOTHING;
