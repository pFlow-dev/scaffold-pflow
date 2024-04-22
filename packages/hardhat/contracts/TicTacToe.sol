// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

library Declaration {

	struct place {
		string label;
		uint8 x;
		uint8 y;
		uint256 initial;
		uint256 capacity;
	}

	struct transition {
		string label;
		uint8 x;
		uint8 y;
		uint8 role;
	}

	struct arc {
		string source;
		string target;
		uint256 weight;
		bool consume;
		bool produce;
		bool inhibit;
		bool read;
	}

	struct PetriNet {
		place[] places;
		transition[] transitions;
		arc[] arcs;
	}

}

library Model {

	event SignaledEvent(
		uint8 indexed role,
		uint8 indexed actionId,
		uint256 indexed scalar
	);

	struct PetriNet {
		Place[] places;
		Transition[] transitions;
		Arc[] arcs;
	}

	struct Position {
		uint8 x;
		uint8 y;
	}

	struct Transition {
		string label;
		uint8 offset;
		Position position;
		uint8 role;
		int256[] delta;
		int256[] guard;
	}

	struct Place {
		string label;
		uint8 offset;
		Position position;
		uint256 initial;
		uint256 capacity;
	}

	enum NodeKind {
		PLACE,
		TRANSITION
	}

	struct Node {
		string label;
		uint8 offset;
		NodeKind kind;
	}

	struct Arc {
		uint256 weight;
		Node source;
		Node target;
		bool inhibitor;
		bool read;
	}

}

interface ModelInterface {
	function model() external returns (Model.PetriNet memory);

	function declaration() external returns (Declaration.PetriNet memory);

	function dryRun(uint8 action, uint256 scalar) external;

	function signal(uint8 action, uint256 scalar) external;

	function signalMany(uint8[] calldata actions, uint256[] calldata scalars) external;
}

abstract contract PflowDSL {
	Model.Place[] internal places;
	Model.Transition[] internal transitions;
	Model.Arc[] internal arcs;

	function placeNode(string memory label, uint8 offset) internal pure returns (Model.Node memory) {
		return Model.Node(label, offset, Model.NodeKind.PLACE);
	}

	function transitionNode(string memory label, uint8 offset) internal pure returns (Model.Node memory) {
		return Model.Node(label, offset, Model.NodeKind.TRANSITION);
	}

	function cell(string memory label, uint256 initial, uint256 capacity, Model.Position memory position) internal returns (Model.Place memory) {
		Model.Place memory p = Model.Place(label, uint8(places.length), position, initial, capacity);
		places.push(p);
		return p;
	}

	function func(string memory label, uint8 vectorSize, uint8 action, uint8 role, Model.Position memory position) internal returns (Model.Transition memory) {
		require(uint8(transitions.length) == action, "transactions must be declared in enum order");
		Model.Transition memory t = Model.Transition(label, action, position, role, new int256[](vectorSize), new int256[](vectorSize));
		transitions.push(t);
		return t;
	}

	function arrow(int256 weight, Model.Place memory p, Model.Transition memory t) internal {
		require(weight > 0, "weight must be > 0");
		arcs.push(Model.Arc(uint256(weight), placeNode(p.label, p.offset), transitionNode(t.label, t.offset), false, false));
		transitions[t.offset].delta[p.offset] = 0 - weight;
	}

	function arrow(int256 weight, Model.Transition memory t, Model.Place memory p) internal {
		require(weight > 0, "weight must be > 0");
		arcs.push(Model.Arc(uint256(weight), transitionNode(t.label, t.offset), placeNode(p.label, p.offset), false, false));
		transitions[t.offset].delta[p.offset] = weight;
	}

	// inhibit transition after threshold weight is reached
	function guard(int256 weight, Model.Place memory p, Model.Transition memory t) internal {
		require(weight > 0, "weight must be > 0");
		arcs.push(Model.Arc(uint256(weight), placeNode(p.label, p.offset), transitionNode(t.label, t.offset), true, false));
		transitions[t.offset].guard[p.offset] = 0 - weight;
	}

	// inhibit transition until threshold weight is reached
	function guard(int256 weight, Model.Transition memory t, Model.Place memory p) internal {
		require(weight > 0, "weight must be > 0");
		arcs.push(Model.Arc(uint256(weight), transitionNode(t.label, t.offset), placeNode(p.label, p.offset), true, true));
		transitions[t.offset].guard[p.offset] = 0 - weight;
	}
}


abstract contract Metamodel is PflowDSL, ModelInterface {

	// sequence is a monotonically increasing counter for each signal
	int256 public sequence = 0;

	// transform is a hook for derived contracts to implement state transitions
	function transform(uint8 i, Model.Transition memory t, uint256 scalar) internal virtual;

	// isInhibited is a hook for derived contracts to implement transition guards
	function isInhibited(Model.Transition memory t) internal view virtual returns (bool);

	// embed a link to the model documentation
	function url() external pure virtual returns (string memory);

	// dryRun checks if a transition is inhibited and if the scalar is non-zero
	function dryRun(uint8 action, uint256 scalar) external view {
		Model.Transition memory t = transitions[action];
		assert(scalar != 0);
		assert(!isInhibited(t));
		assert(action == t.offset);
	}

	function _signal(uint8 action, uint256 scalar) internal {
		Model.Transition memory t = transitions[action];
		assert(!isInhibited(t));
		assert(action == t.offset);
		for (uint8 i = 0; i < uint8(places.length); i++) {
			transform(i, t, scalar);
		}
		sequence++;
		emit Model.SignaledEvent(t.role, action, scalar);
	}

	function signal(uint8 action, uint256 scalar) external {
		_signal(action, scalar);
	}

	function signalMany(uint8[] calldata actions, uint256[] calldata scalars) external {
		require(actions.length == scalars.length, "ModelRegistry: invalid input");
		for (uint256 i = 0; i < actions.length; i++) {
			_signal(actions[i], scalars[i]);
		}
	}

	// model returns an indexed model of the PetriNet
	function model() external view returns (Model.PetriNet memory) {
		return Model.PetriNet(places, transitions, arcs);
	}

	// declaration returns the model in a format suitable for the frontend
	function declaration() external view returns (Declaration.PetriNet memory) {
		Declaration.place[] memory p = new Declaration.place[](places.length);
		for (uint8 i = 0; i < uint8(places.length); i++) {
			p[i] = Declaration.place(places[i].label, places[i].position.x, places[i].position.y, places[i].initial, places[i].capacity);
		}
		Declaration.transition[] memory t = new Declaration.transition[](transitions.length);
		for (uint8 i = 0; i < uint8(transitions.length); i++) {
			t[i] = Declaration.transition(transitions[i].label, transitions[i].position.x, transitions[i].position.y, transitions[i].role);
		}
		Declaration.arc[] memory a = new Declaration.arc[](arcs.length);
		for (uint8 i = 0; i < uint8(arcs.length); i++) {
			assert(arcs[i].source.kind != arcs[i].target.kind);
			a[i] = Declaration.arc(
				arcs[i].source.label,
				arcs[i].target.label,
				arcs[i].weight,
				arcs[i].source.kind == Model.NodeKind.PLACE, // consume
				arcs[i].target.kind == Model.NodeKind.PLACE, // produce
				arcs[i].inhibitor,
				arcs[i].read
			);
		}
		return Declaration.PetriNet(p, t, a);
	}

}

abstract contract TicTacToeModel is Metamodel {

	enum Roles{X, O, HALT}

	enum Properties {
		_00, _01, _02,
		_10, _11, _12,
		_20, _21, _22,
		_next, SIZE
	}

	enum Actions {
		// x moves
		X00, X01, X02,
		X10, X11, X12,
		X20, X21, X22,
		// o moves
		O00, O01, O02,
		O10, O11, O12,
		O20, O21, O22,
		HALT
	}

	// add an action to the model
	function _action(string memory label, Properties prop, Actions action, Roles role, uint8 x, uint8 y) internal {
		require(action < Actions.HALT, "Invalid action");
		Model.Transition memory t = func(label, uint8(Properties.SIZE), uint8(action), uint8(role), Model.Position(x, y));

		// remove token from available set
		arrow(1, places[uint8(prop)], t);

		// REVIEW: By applying turn-tracking logic in the model
		// we enhance the UX by preventing invalid moves
		if (action <= Actions.X22) {
			// track turns by marking 'next' place
			arrow(1, t, places[uint8(Properties._next)]);
		} else {
			// unmark 'next' place
			arrow(1, places[uint8(Properties._next)], t);
		}
	}

	function _place(string memory label, uint8 x, uint8 y) internal {
		cell(label, 1, 1, Model.Position(x, y));
	}

	// declare model properties
	function _props() internal {
		_place("00", 1, 1); // _00
		_place("01", 2, 1); // _01
		_place("02", 3, 1); // _02

		_place("10", 1, 2); // _10
		_place("11", 2, 2); // _11
		_place("12", 3, 2); // _12

		_place("20", 1, 3); // _20
		_place("21", 2, 3); // _21
		_place("22", 3, 3); // _22

		cell("next", 0, 1, Model.Position(6, 6)); // turn-taking
	}

	// declare model actions
	function _actions() internal {
		_action("X00", Properties._00, Actions.X00, Roles.X, 5, 1);
		_action("X01", Properties._01, Actions.X01, Roles.X, 6, 1);
		_action("X02", Properties._02, Actions.X02, Roles.X, 7, 1);

		_action("X10", Properties._10, Actions.X10, Roles.X, 5, 2);
		_action("X11", Properties._11, Actions.X11, Roles.X, 6, 2);
		_action("X12", Properties._12, Actions.X12, Roles.X, 7, 2);

		_action("X20", Properties._20, Actions.X20, Roles.X, 5, 3);
		_action("X21", Properties._21, Actions.X21, Roles.X, 6, 3);
		_action("X22", Properties._22, Actions.X22, Roles.X, 7, 3);

		_action("000", Properties._00, Actions.O00, Roles.O, 1, 5);
		_action("O01", Properties._01, Actions.O01, Roles.O, 2, 5);
		_action("O02", Properties._02, Actions.O02, Roles.O, 3, 5);

		_action("O10", Properties._10, Actions.O10, Roles.O, 1, 6);
		_action("O11", Properties._11, Actions.O11, Roles.O, 2, 6);
		_action("O12", Properties._12, Actions.O12, Roles.O, 3, 6);

		_action("O20", Properties._20, Actions.O20, Roles.O, 1, 7);
		_action("O21", Properties._21, Actions.O21, Roles.O, 2, 7);
		_action("O22", Properties._22, Actions.O22, Roles.O, 3, 7);
	}

	constructor() {
		_props();
		_actions();
	}

}

abstract contract Game is TicTacToeModel {
	address public PlayerX;
	address public PlayerO;
	address public owner;

	int256[] public state = new int256[](uint256(TicTacToeModel.Properties.SIZE));

	function isInhibited(Model.Transition memory t) internal view override returns (bool) {
		Roles r = getRole();
		if (sequence % 2 == int256(0)) {
			require(r == Roles.X, "X turn");
		} else {
			require(r == Roles.O, "O turn");
		}
		require(t.role == uint8(r), "no permission");
		return false;
	}

	function transform(uint8 i, Model.Transition memory t, uint256 scalar) internal override {
		require(scalar == 1, "Invalid multiple");
		if (t.delta[i] != 0) {
			state[i] = state[i] + t.delta[i];
			require(state[i] >= 0, "Invalid state");
		}
	}

	function getRole() public view returns (Roles) {
		if (msg.sender == PlayerX) {
			return Roles.X;
		} else if (msg.sender == PlayerO) {
			return Roles.O;
		} else if (msg.sender == owner) {
			return Roles.HALT;
		} else {
			revert("msg.sender has no roles");
		}
	}
}

/// @custom:security-contact security@stackdump.com
contract TicTacToe is Game {

	constructor(address p0, address p1) {
		owner = tx.origin; // REVIEW: should this be msg.sender?
		require(p0 != p1, "Players must not have the same address.");
		PlayerX = p0;
		PlayerO = p1;
		startGame();
	}

	function url() override external pure returns (string memory) {
		return "https://pflow.xyz/p/zb2rhnPRsyYbyGc2sVkVStXJ8bzqrXR1RQPkvCjf3qnHFK56A/";
	}

	function startGame() internal {
		sequence = 0;
		for (uint8 i = 0; i < uint8(places.length); i++) {
			if (state[places[i].offset] != int256(places[i].initial)) {
				state[places[i].offset] = int256(places[i].initial);
			}
		}
	}

	function resetGame() external {
		require(getRole() == TicTacToeModel.Roles.HALT, "no halt permission");
		startGame();
		emit Model.SignaledEvent(uint8(TicTacToeModel.Roles.HALT), uint8(TicTacToeModel.Actions.HALT), 1);
	}

	function X00() external {
		_signal(uint8(TicTacToeModel.Actions.X00), 1);
	}

	function X01() external {
		_signal(uint8(TicTacToeModel.Actions.X01), 1);
	}

	function X02() external {
		_signal(uint8(TicTacToeModel.Actions.X02), 1);
	}

	function X10() external {
		_signal(uint8(TicTacToeModel.Actions.X10), 1);
	}

	function X11() external {
		_signal(uint8(TicTacToeModel.Actions.X11), 1);
	}

	function X12() external {
		_signal(uint8(TicTacToeModel.Actions.X12), 1);
	}

	function X20() external {
		_signal(uint8(TicTacToeModel.Actions.X20), 1);
	}

	function X21() external {
		_signal(uint8(TicTacToeModel.Actions.X21), 1);
	}

	function X22() external {
		_signal(uint8(TicTacToeModel.Actions.X22), 1);
	}

	function O00() external {
		_signal(uint8(TicTacToeModel.Actions.O00), 1);
	}

	function O01() external {
		_signal(uint8(TicTacToeModel.Actions.O01), 1);
	}

	function O02() external {
		_signal(uint8(TicTacToeModel.Actions.O02), 1);
	}

	function O10() external {
		_signal(uint8(TicTacToeModel.Actions.O10), 1);
	}

	function O11() external {
		_signal(uint8(TicTacToeModel.Actions.O11), 1);
	}

	function O12() external {
		_signal(uint8(TicTacToeModel.Actions.O12), 1);
	}

	function O20() external {
		_signal(uint8(TicTacToeModel.Actions.O20), 1);
	}

	function O21() external {
		_signal(uint8(TicTacToeModel.Actions.O21), 1);
	}

	function O22() external {
		_signal(uint8(TicTacToeModel.Actions.O22), 1);
	}

}