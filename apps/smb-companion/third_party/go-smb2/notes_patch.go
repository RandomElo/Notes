package smb2

import "sync/atomic"

// Notes patch. ForceEncryption makes every request after session setup
// encrypted, even if the server did not ask for it. Set before dialing.
var ForceEncryption bool

// Counters of responses seen by the receiver, to check that the server
// really answers encrypted.
var (
	ResponsesTotal     atomic.Int64
	ResponsesEncrypted atomic.Int64
)
