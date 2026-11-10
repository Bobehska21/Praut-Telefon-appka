# Encrypted secrets (SOPS + age)

Only **encrypted** files live here: `<env>.enc.yaml`. Plaintext Secret manifests are blocked by a hook and by `.gitignore` (`*.dec.*`).

## One-time setup (per developer)
```sh
brew install sops age
mkdir -p ~/.config/sops/age && age-keygen -o ~/.config/sops/age/keys.txt   # prints your PUBLIC key
```
Add the public key (`age1...`) to `.sops.yaml` under the environments you may decrypt. Production uses a separate key that only the pipeline and the release owners hold.

## Create / edit
```sh
sops deploy/secrets/dev.enc.yaml        # opens $EDITOR, encrypts on save
```
The file is an ordinary Kubernetes Secret manifest; SOPS encrypts only `data` / `stringData` values.

## Apply
```sh
sops -d deploy/secrets/dev.enc.yaml | kubectl apply --context kind-dev -n app -f -
```
Then reference it from the chart via `envFromSecrets` in the values file.

## Rules for Claude
- May create the *structure* of a new secret file with placeholder values for you to fill in and encrypt.
- Is asked before decrypting dev/staging files, and is blocked from decrypting anything named `prod`.
- Never writes real secret values.
