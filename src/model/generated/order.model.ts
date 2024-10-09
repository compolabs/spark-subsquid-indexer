import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, StringColumn as StringColumn_, Index as Index_} from "@subsquid/typeorm-store"
import {OrderType} from "./_orderType"
import {OrderStatus} from "./_orderStatus"

@Entity_()
export class Order {
    constructor(props?: Partial<Order>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @BigIntColumn_({nullable: false})
    amount!: bigint

    @Index_()
    @StringColumn_({nullable: false})
    market!: string

    @Index_()
    @Column_("varchar", {length: 4, nullable: false})
    orderType!: OrderType

    @Index_()
    @BigIntColumn_({nullable: false})
    price!: bigint

    @Index_()
    @StringColumn_({nullable: false})
    user!: string

    @Index_()
    @Column_("varchar", {length: 8, nullable: false})
    status!: OrderStatus

    @BigIntColumn_({nullable: false})
    initialAmount!: bigint

    @StringColumn_({nullable: false})
    timestamp!: string
}
