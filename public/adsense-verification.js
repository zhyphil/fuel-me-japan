// Load the verification tag while site approval and live ad-serving validation are pending.
// This must execute before Google's asynchronous script; no consent is inferred.
(window.adsbygoogle = window.adsbygoogle || []).pauseAdRequests = 1;
