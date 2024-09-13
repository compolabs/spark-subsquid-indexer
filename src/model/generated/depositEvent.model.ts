import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class DepositEvent {
    constructor(props?: Partial<DepositEvent>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @StringColumn_({nullable: false})
    txId!: string

    @BigIntColumn_({nullable: false})
    baseAmount!: bigint

    @BigIntColumn_({nullable: false})
    quoteAmount!: bigint

    @Index_()
    @StringColumn_({nullable: false})
    user!: string

    @StringColumn_({nullable: false})
    timestamp!: string
}
