import {
	BigIntColumn as BigIntColumn_,
	Column as Column_,
	Entity as Entity_,
	Index as Index_,
	PrimaryColumn as PrimaryColumn_,
	StringColumn as StringColumn_,
} from "@subsquid/typeorm-store";

@Entity_()
export class DepositForEvent {
	constructor(props?: Partial<DepositForEvent>) {
		Object.assign(this, props);
	}

	@PrimaryColumn_()
	id!: string;

	@Index_()
	@StringColumn_({ nullable: false })
	market!: string;

	@Index_()
	@StringColumn_({ nullable: false })
	user!: string;

	@Index_()
	@StringColumn_({ nullable: false })
	caller!: string;

	@Index_()
	@BigIntColumn_({ nullable: false })
	amount!: bigint;

	@BigIntColumn_({ nullable: false })
	baseAmount!: bigint;

	@BigIntColumn_({ nullable: false })
	quoteAmount!: bigint;

	@Index_()
	@StringColumn_({ nullable: false })
	asset!: string;

	@StringColumn_({ nullable: false })
	txId!: string;

	@StringColumn_({ nullable: false })
	timestamp!: string;
}
