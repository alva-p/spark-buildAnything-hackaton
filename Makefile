.PHONY: contracts-install contracts-format contracts-build contracts-test web-install web-lint web-build verify

contracts-install:
	cd contracts && forge install --no-git OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std

contracts-format:
	cd contracts && forge fmt --check

contracts-build:
	cd contracts && forge build

contracts-test:
	cd contracts && forge test -vvv

web-install:
	cd apps/web && npm install

web-lint:
	cd apps/web && npm run lint

web-build:
	cd apps/web && npm run build

verify: contracts-format contracts-build contracts-test web-lint web-build
