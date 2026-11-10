-- Signed-out clients have no use for these; only signed-in users and the sync job call them.
revoke execute on function public.reference_version(text) from public, anon;
revoke execute on function public.waterbody_at(double precision, double precision) from public, anon;
grant execute on function public.reference_version(text) to authenticated, service_role;
grant execute on function public.waterbody_at(double precision, double precision) to authenticated, service_role;
