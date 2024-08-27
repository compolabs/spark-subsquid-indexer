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

    @StringColumn_({nullable: false})
    txId!: string

    @StringColumn_({nullable: false})
    asset!: string

    @BigIntColumn_({nullable: false})
    amount!: bigint

    @Column_("varchar", {length: 4, nullable: false})
    orderType!: OrderType

    @BigIntColumn_({nullable: false})
    price!: bigint

    @StringColumn_({nullable: false})
    user!: string

    @StringColumn_({nullable: false})
    timestamp!: string
}
