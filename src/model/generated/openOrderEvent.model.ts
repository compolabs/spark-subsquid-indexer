import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"
import {OrderType} from "./_orderType"

@Entity_()
export class OpenOrderEvent {
    constructor(props?: Partial<OpenOrderEvent>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @StringColumn_({nullable: false})
    orderId!: string

    @Index_()
    @Column_("varchar", {length: 4, nullable: false})
    orderType!: OrderType

    @Index_()
    @StringColumn_({nullable: false})
    user!: string

    @BigIntColumn_({nullable: false})
    amount!: bigint

    @Index_()
    @StringColumn_({nullable: false})
    market!: string

    @BigIntColumn_({nullable: false})
    price!: bigint

    @BigIntColumn_({nullable: false})
    baseAmount!: bigint

    @BigIntColumn_({nullable: false})
    quoteAmount!: bigint

    @StringColumn_({nullable: false})
    txId!: string

    @StringColumn_({nullable: false})
    timestamp!: string
}
