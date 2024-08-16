import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_} from "@subsquid/typeorm-store"
import {Order} from "./order.model"

@Entity_()
export class Subscription {
    constructor(props?: Partial<Subscription>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @ManyToOne_(() => Order, {nullable: true})
    orderUpdated!: Order | undefined | null
}
