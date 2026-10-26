# UBI 9 minimal build image — node/npm plus awk/bash/tar is all the yarn build needs.
FROM registry.access.redhat.com/ubi9/nodejs-22-minimal:latest AS build-main
USER root
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /usr/src/app
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
RUN LOCAL_YARN="node $(awk '/yarnPath:/{print $2}' .yarnrc.yml)" && \
    $LOCAL_YARN install --immutable
COPY .swcrc console-extensions.json LICENSE tsconfig.json tsconfig.build.json webpack.config.ts ./
COPY locales ./locales
COPY src ./src
RUN LOCAL_YARN="node $(awk '/yarnPath:/{print $2}' .yarnrc.yml)" && \
    $LOCAL_YARN build

# RHEL 9 nginx with OpenSSL 3.5 (ML-KEM), so the chart's PQC ssl_ecdh_curve defaults work.
FROM registry.access.redhat.com/ubi9/nginx-126:latest
COPY --from=build-main /usr/src/app/dist /builds/main
COPY entrypoint.sh /entrypoint.sh

USER root
RUN chmod +x /entrypoint.sh && \
    rm -rf /usr/share/nginx/html && \
    ln -s /tmp/nginx/html /usr/share/nginx/html && \
    mkdir -p /tmp/nginx && \
    chgrp -R 0 /tmp/nginx /builds && \
    chmod -R g=u /tmp/nginx /builds
USER 1001
ENTRYPOINT ["/entrypoint.sh"]
