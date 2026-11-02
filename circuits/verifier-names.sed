# Applied to the verifier bb writes (circuits/build.sh). Word boundaries: [[:<:]] [[:>:]] on macOS sed.
s/[[:<:]]BaseZKHonkVerifier[[:>:]]/ZekroMemberCheckBase/g
s/[[:<:]]HonkVerifier[[:>:]]/ZekroMemberCheck/g
s/[[:<:]]HonkVerificationKey[[:>:]]/ZekroMemberKey/g
s/[[:<:]]Honk[[:>:]]/ZekroProofLayout/g
s/[[:<:]]Errors[[:>:]]/ZekroCheckFaults/g
s/[[:<:]]FrLib[[:>:]]/ZekroScalarOps/g
s/[[:<:]]ZKTranscriptLib[[:>:]]/ZekroFiatShamirTape/g
s/[[:<:]]ZKTranscript[[:>:]]/ZekroFiatShamirState/g
s/[[:<:]]RelationsLib[[:>:]]/ZekroGateRelations/g
s/[[:<:]]CommitmentSchemeLib[[:>:]]/ZekroPairingOpen/g
s/[[:<:]]IVerifier[[:>:]]/IZekroMemberCheck/g
