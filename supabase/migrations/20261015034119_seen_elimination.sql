-- Packet 5d (spec §17): the red-card overlay plays once per elimination. Cosmetic, so each player may set their own.
alter table players add column seen_elimination_round smallint;
grant update (seen_elimination_round) on players to authenticated;
