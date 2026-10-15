-- Payments (NEXT.md packet 2): players claim, admins confirm or reject.

-- One entry and one buy-back per player (rule 11), so "I've paid" can't stack up claims.
alter table payments add unique (player_id, kind);

-- Confirming goes through confirm_payment(), which stamps who and when; no direct updates by anyone.
drop policy payments_admin on payments;

create function confirm_payment(p_id bigint) returns payments
language plpgsql security definer set search_path = public as $$
declare
  result payments;
begin
  if not is_admin() then
    raise exception 'Only admins can confirm payments';
  end if;
  update payments set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
  where id = p_id and status = 'claimed'
  returning * into result;
  if result.id is null then
    raise exception 'No such claim, or it is already confirmed';
  end if;
  return result;
end $$;

revoke execute on function confirm_payment from public, anon, authenticated;
grant execute on function confirm_payment to authenticated;

-- An admin can reject a claim that hasn't been confirmed (said they paid, didn't). Confirmed ones stay.
create policy payments_reject on payments for delete to authenticated using (is_admin() and status = 'claimed');
