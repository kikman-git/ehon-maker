import SwiftUI

/// Who a book can be sent to. v1 is this fixed roster; the spec's ゆうた・せんせい rows were
/// sample data. Names stay localised so an English device reads "Grandma", not ばあば.
struct FamilyMember: Identifiable, Equatable {
    let id: String
    let nameKey: String
    let subKey: String
    let tint: Color
    let ink: Color

    var name: String { Localized.s(nameKey) }
    var sub: String { Localized.s(subKey) }
    var initial: String { String(name.prefix(1)) }

    static let all: [FamilyMember] = [
        FamilyMember(id: "grandma", nameKey: "family.grandma", subKey: "family.grandma.sub",
                     tint: .ehAccentTint, ink: .ehAccentDeep),
        FamilyMember(id: "grandpa", nameKey: "family.grandpa", subKey: "family.grandpa.sub",
                     tint: .ehAccent2Tint, ink: .ehAccent2Deep),
        FamilyMember(id: "mom", nameKey: "family.mom", subKey: "family.mom.sub",
                     tint: Color(red: 0.94, green: 0.98, blue: 0.88), ink: .ehAccent2Deep),
        FamilyMember(id: "dad", nameKey: "family.dad", subKey: "family.dad.sub",
                     tint: .ehEdge, ink: .ehMuted),
    ]
}
