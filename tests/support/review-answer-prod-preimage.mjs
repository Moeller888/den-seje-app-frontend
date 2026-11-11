// Production's review_answer(uuid,integer,text,uuid) pre-image for the single-payout migration tests
// (20261111120000_review_answer_single_payout). Read-only catalog 2026-11-11: md5(prosrc)
// 310f72f44b3720c25e24a4d14307a3df, md5(pg_get_functiondef) c5a7e38756a69099141c8987d8703c55,
// SECURITY DEFINER, search_path public, pg_temp, EXECUTE service_role only. Test fixture only.

// Production's prosrc of review_answer(uuid,integer,text,uuid), byte for byte (CRLF line ends), read-only
// catalog 2026-11-11.
export const PROD_BODY = Buffer.from(
  "DQpkZWNsYXJlDQogIHZfc3R1ZGVudF9pZCB1dWlkOw0KICB2X3hwX2dhaW4gaW50Ow0KYmVnaW4NCg0KICAtLSDwn5SlIGZpbmQgc3R1" +
  "ZGVudA0KICBzZWxlY3Qgc3R1ZGVudF9pZCBpbnRvIHZfc3R1ZGVudF9pZA0KICBmcm9tIHF1ZXN0aW9uX2luc3RhbmNlcw0KICB3aGVy" +
  "ZSBpZCA9IHBfaW5zdGFuY2VfaWQ7DQoNCiAgaWYgdl9zdHVkZW50X2lkIGlzIG51bGwgdGhlbg0KICAgIHJhaXNlIGV4Y2VwdGlvbiAn" +
  "SW5zdGFuY2Ugbm90IGZvdW5kJzsNCiAgZW5kIGlmOw0KDQogIC0tIPCflKUgc2NvcmUg4oaSIFhQDQogIHZfeHBfZ2FpbiA6PSBjYXNl" +
  "IHBfc2NvcmUNCiAgICB3aGVuIDEgdGhlbiAwDQogICAgd2hlbiAyIHRoZW4gMTANCiAgICB3aGVuIDMgdGhlbiAyNQ0KICAgIHdoZW4g" +
  "NCB0aGVuIDUwDQogICAgZWxzZSAwDQogIGVuZDsNCg0KICAtLSDwn5SlIG9wZGF0ZXIgcXVlc3Rpb25faW5zdGFuY2UNCiAgdXBkYXRl" +
  "IHF1ZXN0aW9uX2luc3RhbmNlcw0KICBzZXQNCiAgICB0ZWFjaGVyX3Njb3JlID0gcF9zY29yZSwNCiAgICB0ZWFjaGVyX2ZlZWRiYWNr" +
  "ID0gcF9mZWVkYmFjaywNCiAgICByZXZpZXdlZF9hdCA9IG5vdygpLA0KICAgIHJldmlld2VkX2J5ID0gcF90ZWFjaGVyX2lkDQogIHdo" +
  "ZXJlIGlkID0gcF9pbnN0YW5jZV9pZDsNCg0KICAtLSDwn5SlIG9wZGF0ZXIgWFAgKyBMRVZFTA0KICB1cGRhdGUgc3R1ZGVudF9wcm9n" +
  "cmVzcw0KICBzZXQNCiAgICB4cCA9IHhwICsgdl94cF9nYWluLA0KICAgIGxldmVsID0gZmxvb3IoKHhwICsgdl94cF9nYWluKSAvIDEw" +
  "MCkgKyAxDQogIHdoZXJlIHN0dWRlbnRfaWQgPSB2X3N0dWRlbnRfaWQ7DQoNCmVuZDsNCg==", "base64").toString("utf8");

export const PROD_FUNCTION = `
  CREATE FUNCTION public.review_answer(p_instance_id uuid, p_score integer, p_feedback text, p_teacher_id uuid)
   RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$${PROD_BODY}$function$;
  REVOKE EXECUTE ON FUNCTION public.review_answer(uuid, integer, text, uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.review_answer(uuid, integer, text, uuid) TO service_role;`;
