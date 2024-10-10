import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class WithdrawEvent {
    constructor(props?: Partial<WithdrawEvent>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @StringColumn_({nullable: false})
    market!: string

    @Index_()
    @StringColumn_({nullable: false})
    user!: string

    @Index_()
    @BigIntColumn_({nullable: false})
    amount!: bigint

    @BigIntColumn_({nullable: false})
    baseAmount!: bigint

    @BigIntColumn_({nullable: false})
    quoteAmount!: bigint

    @Index_()
    @StringColumn_({nullable: false})
    asset!: string

    @StringColumn_({nullable: false})
    txId!: string

    @StringColumn_({nullable: false})
    timestamp!: string
}
