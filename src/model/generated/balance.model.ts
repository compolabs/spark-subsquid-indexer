import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, StringColumn as StringColumn_, Index as Index_, BigIntColumn as BigIntColumn_} from "@subsquid/typeorm-store"

@Entity_()
export class Balance {
    constructor(props?: Partial<Balance>) {
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
    baseAmount!: bigint

    @Index_()
    @BigIntColumn_({nullable: false})
    quoteAmount!: bigint

    @StringColumn_({nullable: false})
    timestamp!: string
}
