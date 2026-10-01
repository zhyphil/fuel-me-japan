// Load the verification tag while ad serving and consent setup are pending.
// This must execute before Google's asynchronous script; no consent is inferred.
(window.adsbygoogle = window.adsbygoogle || []).pauseAdRequests = 1;
