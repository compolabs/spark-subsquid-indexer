## Spark OrderBook indexer

Contract: https://github.com/compolabs/orderbook-contract/tree/master/market-contract

_Please refer to the [documentation website](https://docs.sqd.dev/) for a thorough guide on all Squid indexer features_

## Local usage

1. Clone the repository

   ```sh
   git clone git@github.com:compolabs/spark-subsquid-indexer.git
   ```

2. Open it locally

   ```sh
   cd spark-subsquid-indexer
   ```

3. First, install the latest version of Subsquid CLI as a global npm package

   ```sh
   npm i -g @subsquid/cli@latest
   ```

4. Install dependencies

   ```sh
   npm i
   ```

5. Generate TypeORM entities from the schema file

   ```sh
   sqd codegen
   ```

6. Generate data access classes for an ABI file(s) in the ./abi folder

   ```sh
   sqd typegen
   ```   

7. Compile the project

   ```sh
   sqd build
   ```

8. Launch Postgres database to store the data

   ```sh
   sqd up
   ```

9. Apply database migrations to create the target schema

   ```sh
   sqd migration:generate
   ```

10. Run indexer

   ```sh
   sqd process
   ```

11. In another terminal, launch the server (open http://localhost:4000/graphql)

   ```sh
   sqd serve
   ```    

12. Shut down the database

   ```sh
   sqd down
   ```   


