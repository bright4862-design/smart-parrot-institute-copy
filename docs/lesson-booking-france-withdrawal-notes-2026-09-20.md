# France/EU withdrawal notes — lesson booking

Research refresh: 2026-09-20. This is an engineering record, not legal advice. Final consumer-facing terms and the classification of fixed-date English lessons require French consumer-law review before launch.

## Current legal baseline

- **Code de la consommation L221-18** gives consumers a default 14-day withdrawal period for distance service contracts, starting from conclusion of the contract.
- **L221-25** says that when a paid service is requested to start during the withdrawal period, the trader must collect the consumer's express request and acknowledgement about loss of the right after full performance. If the consumer withdraws after performance has started, the amount due is proportional to the service already supplied; absent the required express request/information, no amount is due under that article.
- **L221-28** contains exceptions, including certain fixed-date accommodation, transport, catering and leisure-activity contracts. It is not safe for engineering to decide on its own whether a 1:1 English lesson is a covered leisure activity.
- **L221-21**, as amended from **19 June 2026**, requires an online withdrawal function for distance contracts concluded through an online interface when a withdrawal right applies.
- **D221-5**, effective **19 June 2026**, specifies that the function must be clearly labelled ("renoncer au contrat ici" or an unambiguous equivalent), visible, directly/easily accessible and available throughout the withdrawal period. It also requires an online declaration/confirmation flow and an acknowledgement on a durable medium that records the declaration and its date/time.
- EU Directive **2023/2673**, Article 11a, is the EU-level source behind the online withdrawal-function requirement.

Primary sources checked on 2026-09-20:

- Légifrance, Code de la consommation, withdrawal section L221-18 through L221-28: https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006069565/LEGISCTA000032221365/
- Légifrance, Article L221-21: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226834/
- Légifrance, Article L221-25: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044563179/
- Légifrance, Article D221-5: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053303365/
- EUR-Lex, Directive (EU) 2023/2673: https://eur-lex.europa.eu/eli/dir/2023/2673/oj

## Engineering decision for Phase 3A

The backend does **not** infer that every Smart Parrot lesson has a 14-day withdrawal right, and it does not infer the opposite. Each immutable policy version must explicitly set:

```json
{
  "withdrawal_mode": "service_14d",
  "withdrawal_window_days": 14
}
```

before the `withdrawal` request path is enabled. Any other value, including the default `review_required`, fails closed with `withdrawal_not_enabled_for_policy`.

That switch is intentionally policy-versioned so counsel can decide the correct legal treatment before a policy is published. A normal contractual cancellation remains a separate `cancel` action and continues to use the accepted policy's cancellation windows.

For a `service_14d` policy, Phase 3A only accepts withdrawal **before the lesson starts**. It therefore does not attempt to calculate the proportional post-start amount described by L221-25. A future post-start withdrawal implementation, if legally needed, must be separately designed and reviewed.

## Durable-medium acknowledgement

Phase 3A records an exact server-generated acknowledgement payload in `compliance_notice_outbox` at cancellation finalization. It does **not** send production email or claim that an outbox row by itself satisfies the durable-medium requirement. Launch requires a delivery provider, delivery evidence, retry/alerting and counsel-approved wording.

## Existing wording to review before public booking UI

Phase 1A currently records the student's express-start request for lessons inside 14 days. Before the reservation/checkout flow becomes a public production UI, counsel should confirm:

1. whether fixed-date English lessons fall inside or outside the L221-28 exception;
2. the exact express-request and acknowledgement wording required by L221-25 for the chosen policy model;
3. whether any cancellation fee can coexist with withdrawal during the 14-day period;
4. the required withdrawal-function labels, confirmation screen and acknowledgement wording under L221-21/D221-5;
5. the consumer mediator details and policy disclosures required for France.
