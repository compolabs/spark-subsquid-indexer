import {
	BigIntColumn as BigIntColumn_,
	Column as Column_,
	Entity as Entity_,
	Index as Index_,
	PrimaryColumn as PrimaryColumn_,
	StringColumn as StringColumn_,
} from "@subsquid/typeorm-store";

@Entity_()
export class CancelOrderEvent {
	constructor(props?: Partial<CancelOrderEvent>) {
		Object.assign(this, props);
	}

	@PrimaryColumn_()
	id!: string;

	@Index_()
	@StringColumn_({ nullable: false })
	market!: string;

	@Index_()
	@StringColumn_({ nullable: false })
	orderId!: string;

	@Index_()
	@StringColumn_({ nullable: false })
	user!: string;

	@BigIntColumn_({ nullable: false })
	baseAmount!: bigint;

	@BigIntColumn_({ nullable: false })
	quoteAmount!: bigint;

	@StringColumn_({ nullable: false })
	txId!: string;

	@StringColumn_({ nullable: false })
	timestamp!: string;
}
