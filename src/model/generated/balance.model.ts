import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, BigIntColumn as BigIntColumn_, StringColumn as StringColumn_, Index as Index_} from "@subsquid/typeorm-store"

@Entity_()
export class Balance {
    constructor(props?: Partial<Balance>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

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
