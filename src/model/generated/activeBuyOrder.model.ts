import {
	BigIntColumn as BigIntColumn_,
	Column as Column_,
	Entity as Entity_,
	Index as Index_,
	PrimaryColumn as PrimaryColumn_,
	StringColumn as StringColumn_,
} from "@subsquid/typeorm-store";
import type { OrderStatus } from "./_orderStatus";
import type { OrderType } from "./_orderType";

@Entity_()
export class ActiveBuyOrder {
	constructor(props?: Partial<ActiveBuyOrder>) {
		Object.assign(this, props);
	}

	@PrimaryColumn_()
	id!: string;

	@BigIntColumn_({ nullable: false })
	amount!: bigint;

	@Index_()
	@Column_("varchar", { length: 4, nullable: false })
	orderType!: OrderType;

	@Index_()
	@StringColumn_({ nullable: false })
	market!: string;

	@Index_()
	@BigIntColumn_({ nullable: false })
	price!: bigint;

	@Index_()
	@StringColumn_({ nullable: false })
	user!: string;

	@Index_()
	@Column_("varchar", { length: 8, nullable: false })
	status!: OrderStatus;

	@BigIntColumn_({ nullable: false })
	initialAmount!: bigint;

	@StringColumn_({ nullable: false })
	timestamp!: string;
}
