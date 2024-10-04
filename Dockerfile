FROM node:20 AS build-env
COPY . /app
WORKDIR /app

RUN npm i -g @subsquid/cli@latest
RUN npm i
RUN sqd codegen
RUN sqd typegen
RUN sqd build

FROM node:20
COPY --from=build-env /app /app
WORKDIR /app

RUN npm i -g @subsquid/cli@latest

ENTRYPOINT ["sqd"]
