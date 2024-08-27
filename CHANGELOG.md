# Changelog

## [Unreleased]
### Changes in GraphQL Schema (schema.graphql)

- **Removal of `AssetType` enum**:
  - The `AssetType` enum has been removed from the schema as it is no longer required for the data model.
  
- **Removal of `assetType` field**:
  - The `assetType` field has been removed from the following types:
    - `OpenOrderEvent`
    - `Order`
    - `ActiveSellOrder`
    - `ActiveBuyOrder`
  
  This change may impact API integrations that use these types, as the asset type data is no longer transmitted.

- **Removal of `Subscription` type**:
  - The `Subscription` type has been completely removed from the schema.

- **Updated `TradeOrderEvent` type**:
  - The `TradeOrderEvent` type has been updated by removing the commented out `block_height` field.
