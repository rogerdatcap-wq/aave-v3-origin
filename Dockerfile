FROM ghcr.io/foundry-rs/foundry:stable

WORKDIR /workspace

COPY . .
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/bin/sh", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["test", "-vvv", "--no-match-contract", "DeploymentsGasLimits"]
