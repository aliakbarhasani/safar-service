# Feedback Service — Handlers

The feedback/trust aggregation subscriber for the `FeedbackSubmitted` event
lives in the user-profile bounded context:

```
03-user-service/handlers/FeedbackSubmitted.handler.js
```

That handler reads the event published by this service (`SubmitReviewUseCase`)
and atomically updates the reviewee's moving-average `rating` and
`total_reviews` on the PG `users` profile table — so offenders can never force
recomputation or a full-table `AVG()` scan.

This directory is part of the service's standard structure and is reserved for
additional feedback-domain subscribers (e.g. moderation, analytics) in later
phases.