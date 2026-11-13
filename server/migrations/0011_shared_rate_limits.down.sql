SET lock_timeout = '5s';

-- DATA LOSS: resets all request counters. Revert code/use RATE_LIMIT_STORE=memory on every replica first.
DROP TABLE rate_limit_buckets;
