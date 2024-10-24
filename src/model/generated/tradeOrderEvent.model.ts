import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, BigIntColumn as BigIntColumn_, BooleanColumn as BooleanColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class TradeOrderEvent {
    constructor(props?: Partial<TradeOrderEvent>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @StringColumn_({nullable: false})
    market!: string

    @Index_()
    @StringColumn_({nullable: false})
    sellOrderId!: string

    @Index_()
    @StringColumn_({nullable: false})
    buyOrderId!: string

    @Index_()
    @BigIntColumn_({nullable: false})
    tradeSize!: bigint

    @Index_()
    @BigIntColumn_({nullable: false})
    tradePrice!: bigint

    @Index_()
    @StringColumn_({nullable: false})
    seller!: string

    @Index_()
    @StringColumn_({nullable: false})
    buyer!: string

    @Index_()
    @BooleanColumn_({nullable: false})
    sellerIsMaker!: boolean

    @BigIntColumn_({nullable: false})
    sellerBaseAmount!: bigint

    @BigIntColumn_({nullable: false})
    sellerQuoteAmount!: bigint

    @BigIntColumn_({nullable: false})
    buyerBaseAmount!: bigint

    @BigIntColumn_({nullable: false})
    buyerQuoteAmount!: bigint

    @Index_()
    @StringColumn_({nullable: false})
    txId!: string

    @StringColumn_({nullable: false})
    timestamp!: string
}
